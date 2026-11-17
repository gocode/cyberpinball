// Disposition des écrans (--disposition) : la vraie page de l’éditeur (screen.html), dans l’état que
// rendent arrange.ts et wizard.ts, sur chaque jeu d’écrans simulé, en français et en anglais : aucun
// problème de mise en page, sur aucune fenêtre. L’historique et le garde-fou sur des pages témoins sont
// dans disposition-ecrans.test.ts ; ce banc en est séparé (17/11/2026) pour que les deux lancements
// d’Electron tournent en parallèle sous node --test.

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
