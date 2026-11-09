// Cyber Pinball se ferme tout entier avec sa fenêtre, et ne tourne qu'une fois (lifetime.ts).
// Signalement du 08/11/2026 : fermer la fenêtre « Cyber Pinball » depuis Windows laissait des
// processus dans le gestionnaire des tâches (fronton, DMD, topper et voiles restés ouverts), et un
// nouveau lancement démarrait à côté de l'instance restée ouverte.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { quitAfterWindowClosed, SINGLE_INSTANCE_WAIT_MS, singleInstanceStep, type ClosedWindowFacts } from '../lifetime';
import { REPO_ROOT } from './i18n-scan';

const APP_SRC = path.join(REPO_ROOT, 'app', 'src');
const read = (file: string) => fs.readFileSync(path.join(APP_SRC, file), 'utf8');
const base: ClosedWindowFacts = { quitting: false, relaunching: false, main: false, hadTaskbarButton: false, taskbarWindowsLeft: 0 };

test('une fenêtre principale fermée depuis Windows ferme toute l’application', () => {
  // Playfield fermé par la barre des tâches : fronton, DMD et voiles restent, l'application se ferme quand même.
  assert.equal(quitAfterWindowClosed({ ...base, main: true, hadTaskbarButton: true, taskbarWindowsLeft: 0 }), 'main');
  // Fronton fermé par Alt+F4 : sans bouton, mais fenêtre du menu.
  assert.equal(quitAfterWindowClosed({ ...base, main: true, taskbarWindowsLeft: 1 }), 'main');
  // « Récupérer » ouverte : le playfield fermé ferme aussi l'application.
  assert.equal(quitAfterWindowClosed({ ...base, main: true, hadTaskbarButton: true, taskbarWindowsLeft: 1 }), 'main');
});

test('la dernière fenêtre avec un bouton dans la barre des tâches ferme l’application', () => {
  // Réglages de VPX seuls (--reglages), ou toute fenêtre à venir.
  assert.equal(quitAfterWindowClosed({ ...base, hadTaskbarButton: true, taskbarWindowsLeft: 0 }), 'last-taskbar');
  // « Récupérer » fermée, le menu reste : rien ne se ferme.
  assert.equal(quitAfterWindowClosed({ ...base, hadTaskbarButton: true, taskbarWindowsLeft: 1 }), undefined);
  // Un voile, une notice de partie : sans bouton ni rôle principal, rien ne se ferme.
  assert.equal(quitAfterWindowClosed({ ...base, taskbarWindowsLeft: 0 }), undefined);
});

test('une relève ou une fermeture en cours ne déclenchent pas d’autre fermeture', () => {
  assert.equal(quitAfterWindowClosed({ ...base, main: true, hadTaskbarButton: true, relaunching: true }), undefined);
  assert.equal(quitAfterWindowClosed({ ...base, main: true, hadTaskbarButton: true, quitting: true }), undefined);
});

test('un second lancement attend une instance qui se ferme, puis renonce ; une relève démarre tout de suite', () => {
  assert.equal(singleInstanceStep({ relaying: false, waited: 0 }), 'retry');
  assert.equal(singleInstanceStep({ relaying: false, waited: SINGLE_INSTANCE_WAIT_MS - 1 }), 'retry');
  assert.equal(singleInstanceStep({ relaying: false, waited: SINGLE_INSTANCE_WAIT_MS }), 'give-up');
  assert.equal(singleInstanceStep({ relaying: true, waited: 0 }), 'start-and-retry');
  assert.equal(singleInstanceStep({ relaying: true, waited: 60_000 }), 'start-and-retry');
});

test('chaque fenêtre de l’application passe par createWindow, qui suit son bouton de barre des tâches', () => {
  // Une fenêtre créée à part échapperait à la règle : l'application pourrait vivre sans fenêtre visible.
  const outside = fs
    .readdirSync(APP_SRC)
    .filter((f) => f.endsWith('.ts') && f !== 'offscreen.ts')
    .filter((f) => /new BrowserWindow\s*\(/.test(read(f)));
  assert.deepEqual(outside, [], 'new BrowserWindow hors de createWindow (offscreen.ts)');
  const offscreen = read('offscreen.ts');
  const created = offscreen.match(/new BrowserWindow\s*\(/g)?.length ?? 0;
  const noted = offscreen.match(/noteTaskbarButton\(win, options\.skipTaskbar\)/g)?.length ?? 0;
  assert.equal(noted, created, 'chaque new BrowserWindow de createWindow appelle noteTaskbarButton');
});

test('les fenêtres du menu et de l’assistant sont principales ; main.ts tient l’instance unique', () => {
  assert.match(read('frontend.ts'), /quitWithWindow\(win, title\)/);
  assert.match(read('wizard.ts'), /quitWithWindow\(win, /);
  const main = read('main.ts');
  assert.match(main, /configureLifetime\(\{ relaunching: isRelaunching \}\)/);
  // Le verrou est demandé avant que l'application ne soit prête, et rien ne s'ouvre sans lui.
  assert.ok(main.indexOf('holdSingleInstance(') < main.indexOf('app.whenReady()'), 'holdSingleInstance avant app.whenReady');
  assert.match(main, /if \(!\(await single\)\) return app\.exit\(0\);/);
  // Le menu revient au premier plan quand on relance Cyber Pinball.
  assert.match(read('frontend.ts'), /handleSecondLaunch\(/);
});
