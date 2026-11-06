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
// - la vraie page de l'éditeur (screen.html), dans l'état que rendent arrange.ts et wizard.ts, sur
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

test('garde-fou : un calque qui coupe un texte, un texte écrit par la feuille de style, une icône seule sur sa ligne', { skip: electron ? false : 'Electron sous Windows requis', timeout: 180_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-recouvrements-'));
  try {
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    fs.writeFileSync(path.join(dir, 'cas.json'), JSON.stringify(CASES));
    const env: NodeJS.ProcessEnv = { ...process.env, CP_LAYOUT_CHECK: path.join(APP, 'dist', 'layout-check.js'), CP_CASES: path.join(dir, 'cas.json'), CP_OUT: path.join(dir, 'out.json') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 170_000 });
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
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- La vraie page de l'éditeur, sur chaque jeu d'écrans ----------

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
type Zone = Bounds & { aspect?: number };
interface Setup {
  /** Jeu d'écrans de packages\core\ecrans-simules, ou écrans décrits ici. */
  ecrans: string | Bounds[];
  assignments: Record<string, number>;
  zones?: Record<string, Zone>;
  /** Rotation du playfield (90, 270 : borne vue de côté). */
  rotation?: number;
}

/** Bureau à un écran : playfield en 9:16 à gauche, backglass et DMD à côté. */
const ONE_SCREEN_ZONES: Record<string, Zone> = {
  playfield: { x: 0, y: 0, width: 0.316, height: 1, aspect: 9 / 16 },
  backglass: { x: 0.34, y: 0, width: 0.66, height: 0.66 },
  dmd: { x: 0.34, y: 0.7, width: 0.66, height: 0.165, aspect: 4 },
};
/** Fronton partagé : backglass en haut, bande DMD 4:1 en bas. */
const SHARED_BACKGLASS: Record<string, Zone> = {
  backglass: { x: 0, y: 0, width: 1, height: 0.75 },
  dmd: { x: 0, y: 0.75, width: 1, height: 0.25, aspect: 4 },
};

const SETUPS: Record<string, Setup> = {
  borne: { ecrans: 'borne', assignments: { playfield: 0, backglass: 1, dmd: 2, topper: 3 }, rotation: 270 },
  'borne-fronton-partage': { ecrans: 'borne', assignments: { playfield: 0, backglass: 1, dmd: 1, topper: 3 }, zones: SHARED_BACKGLASS, rotation: 270 },
  'poste-deux-ecrans': { ecrans: 'poste-deux-ecrans', assignments: { playfield: 0, backglass: 1, dmd: 1 }, zones: SHARED_BACKGLASS },
  'pc-dev': { ecrans: 'pc-dev', assignments: { playfield: 0, backglass: 1, dmd: 2, topper: 3 } },
  'un-ecran': { ecrans: 'un-ecran', assignments: { playfield: 0, backglass: 0, dmd: 0 }, zones: ONE_SCREEN_ZONES },
  'un-ecran-1366': { ecrans: [{ x: 0, y: 0, width: 1366, height: 768 }], assignments: { playfield: 0, backglass: 0, dmd: 0 }, zones: ONE_SCREEN_ZONES },
  'un-ecran-4k': { ecrans: [{ x: 0, y: 0, width: 3840, height: 2160 }], assignments: { playfield: 0, backglass: 0, dmd: 0 }, zones: ONE_SCREEN_ZONES },
};

const PAGE_BENCH = String.raw`
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const core = require(process.env.CP_CORE);
const arrange = require(process.env.CP_ARRANGE);
const { checkLayout } = require(process.env.CP_LAYOUT_CHECK);
const setups = JSON.parse(fs.readFileSync(process.env.CP_SETUPS, 'utf8'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
ipcMain.on('i18n', (event) => {
  event.returnValue = { language: core.language(), locale: core.locale(), messages: core.messagesOf(core.language()) };
});
const KEYS = { previous: ['ShiftLeft'], next: ['ShiftRight'], confirm: ['Digit1'], exit: ['Escape'], back: ['Escape'] };
// Les écrans d'un jeu de packages\core\ecrans-simules tels que les lit l'application (CYBERPINBALL_DISPLAYS).
const displaysOf = (ecrans) =>
  typeof ecrans === 'string'
    ? JSON.parse(fs.readFileSync(path.join(process.env.CP_ECRANS, ecrans + '.json'), 'utf8').replace(/^﻿/, ''))
    : ecrans.map((bounds, i) => ({ gdiName: '\\\\.\\DISPLAY' + (i + 1), friendlyName: 'Écran ' + (i + 1), monitorDescription: 'Generic PnP Monitor', bounds, rotation: 0, primary: i === 0, scale: 1 }));
// État d'une fenêtre d'écran pendant la disposition, comme wizard.ts le compose (screenView, phase « arrange »).
function stateOf(host, s, index, rotation) {
  const display = host.displays[index];
  const panelHere = index === (host.assignments.playfield ?? 0);
  const roles = core.ROLES.filter((r) => host.assignments[r.id] === index).map((r) => r.label);
  const assignedLabel = roles.length ? roles.join(' + ') : undefined;
  return {
    phase: 'arrange',
    color: '#2f8f9d',
    number: String(index + 1),
    name: assignedLabel ?? '',
    details: display.gdiName + ' · ' + (display.friendlyName || display.monitorDescription) + ' (' + display.bounds.width + ' × ' + display.bounds.height + ')',
    rotation: panelHere ? rotation : 0,
    assignedLabel,
    quit: { button: core.t('Quitter sans enregistrer') },
    findings: [],
    summary: [],
    lines: [],
    zones: arrange.arrangeZones(host, s, index),
    highlight: panelHere,
    prompt: panelHere ? '' : (assignedLabel ?? core.t('Aucun rôle')),
    step: panelHere ? '' : core.t('Disposition des écrans en cours'),
    hint: panelHere ? '' : core.t('Tirez une zone pour la déplacer, jusque sur un autre écran · tirez un coin pour la redimensionner'),
    arrange: panelHere ? { ...arrange.arrangePanel(host, s, (codes) => codes.join(' / ')), findings: [] } : undefined,
  };
}
// Une erreur du banc l'arrête aussitôt, en échec (sinon il attendrait la fin du délai).
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});
app.whenReady().then(async () => {
  const out = {};
  // Une seule fenêtre, jamais montrée (rendu hors écran), mise à la taille de chaque écran simulé.
  const win = new BrowserWindow({ show: false, frame: false, skipTaskbar: true, focusable: false, width: 1920, height: 1080, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, preload: process.env.CP_PRELOAD, contextIsolation: false, sandbox: false } });
  for (const lang of ['fr', 'en']) {
    core.setLanguage(lang);
    for (const [name, setup] of Object.entries(setups)) {
      const host = { displays: displaysOf(setup.ecrans), assignments: { ...setup.assignments }, zones: JSON.parse(JSON.stringify(setup.zones ?? {})), keys: KEYS };
      // Deux moments : à l'ouverture (ligne « Zone », playfield choisi), puis le DMD choisi, sa liste ouverte.
      const opened = arrange.startArrange(host, core.t('Enregistrer'), { item: 'role' });
      const dmd = { ...arrange.startArrange(host, core.t('Enregistrer'), { role: 'dmd', item: 'role' }), mode: 'choice', choice: 1 };
      for (const [moment, s] of [['ouverture', opened], ['dmd', dmd]]) {
        for (const [index, display] of host.displays.entries()) {
          const { width, height } = display.bounds;
          win.setBounds({ x: 0, y: 0, width, height });
          await win.loadFile(process.env.CP_SCREEN);
          for (let i = 0; i < 40 && (await win.webContents.executeJavaScript('innerWidth + "x" + innerHeight')) !== width + 'x' + height; i++) await new Promise((r) => setTimeout(r, 50));
          await win.webContents.executeJavaScript('window.cpRender(' + JSON.stringify(stateOf(host, s, index, setup.rotation ?? 0)) + '); document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 250)))');
          const key = lang + ' ' + name + ' ' + moment + ' écran ' + (index + 1) + ' (' + width + ' × ' + height + ')';
          out[key] = {
            problems: await checkLayout(win.webContents),
            window: await win.webContents.executeJavaScript('[innerWidth, innerHeight]'),
            zones: stateOf(host, s, index, 0).zones.length,
            labels: await win.webContents.executeJavaScript("[...document.querySelectorAll('.zone .zone-label')].map((e) => e.textContent)"),
            hint: await win.webContents.executeJavaScript("document.getElementById('hint').textContent"),
          };
          // Captures pour l'oeil (CP_SHOTS) : une image pas encore prête se redemande une fois.
          if (process.env.CP_SHOTS) {
            let shot;
            try {
              shot = await win.webContents.capturePage();
            } catch {
              win.webContents.invalidate();
              await new Promise((r) => setTimeout(r, 500));
              shot = await win.webContents.capturePage().catch(() => undefined);
            }
            if (shot) fs.writeFileSync(path.join(process.env.CP_SHOTS, key.replace(/[^\w-]+/g, '_') + '.png'), shot.toPNG());
          }
        }
      }
    }
  }
  fs.writeFileSync(process.env.CP_OUT, JSON.stringify(out));
  app.exit(0);
});
`;

// Préchargement du banc : à la place de app/src/preload.ts, le rendu est appelé directement.
const PRELOAD = String.raw`
const { ipcRenderer } = require('electron');
window.cyberI18n = ipcRenderer.sendSync('i18n');
window.cyber = { onState: (render) => { window.cpRender = render; }, ready() {}, act() {}, onSound() {}, soundStatus() {} };
`;

test('disposition des écrans : sur chaque fenêtre de l’éditeur, de la borne au bureau à un écran, de 1366 × 768 à la 4K, rien ne se recouvre', { skip: electron ? false : 'Electron sous Windows requis', timeout: 300_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-disposition-'));
  try {
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, PAGE_BENCH);
    fs.writeFileSync(path.join(dir, 'preload.cjs'), PRELOAD);
    fs.writeFileSync(path.join(dir, 'setups.json'), JSON.stringify(SETUPS));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CP_CORE: path.join(REPO, 'packages', 'core', 'dist', 'index.js'),
      CP_ARRANGE: path.join(APP, 'dist', 'arrange.js'),
      CP_LAYOUT_CHECK: path.join(APP, 'dist', 'layout-check.js'),
      CP_SCREEN: path.join(APP, 'renderer', 'screen.html'),
      CP_ECRANS: path.join(REPO, 'packages', 'core', 'ecrans-simules'),
      CP_PRELOAD: path.join(dir, 'preload.cjs'),
      CP_SETUPS: path.join(dir, 'setups.json'),
      CP_OUT: path.join(dir, 'out.json'),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 290_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.ok(fs.existsSync(path.join(dir, 'out.json')), `banc arrêté sans relevé\n${run.stdout}\n${run.stderr}`);
    const found = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as Record<string, { problems: string[]; window: number[]; zones: number; labels: string[]; hint: string }>;
    // 2 langues × (4 + 4 + 3 + 4 + 1 + 1 + 1 écrans) × 2 moments.
    assert.equal(Object.keys(found).length, 2 * 18 * 2);
    const problems = Object.entries(found).flatMap(([where, r]) => r.problems.map((p) => `${where} : ${p}`));
    assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
    for (const [where, r] of Object.entries(found)) {
      const [w, h] = /\((\d+) × (\d+)\)$/.exec(where)!.slice(1).map(Number);
      assert.deepEqual(r.window, [w, h], `${where} : fenêtre à la taille de l’écran simulé`);
      assert.equal(r.labels.length, r.zones, `${where} : une étiquette par zone`);
      assert.ok(r.labels.every((l) => / · \d+ × \d+ · /.test(l)), `${where} : étiquettes des zones ${JSON.stringify(r.labels)}`);
    }
    const fronton = found['fr borne ouverture écran 2 (1920 × 1080)']!;
    assert.deepEqual(fronton.labels, ['Backglass · 1920 × 1080 · plein écran']);
    assert.equal(fronton.hint, 'Tirez une zone pour la déplacer, jusque sur un autre écran · tirez un coin pour la redimensionner');
    assert.equal(found['en borne ouverture écran 2 (1920 × 1080)']!.hint, 'Drag an area to move it, even onto another screen · drag a corner to resize it');
    assert.equal(found['fr borne ouverture écran 1 (3840 × 2160)']!.hint, '', 'l’écran du panneau dit le geste dans le panneau');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
