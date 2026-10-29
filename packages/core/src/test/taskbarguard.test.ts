import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { screenCover } from '../screencover';
import { guardMayAct, repairNotice, stackingReport, TASKBAR_REPAIRS_BEFORE_HIDE, TaskbarGuard, type GuardScreen } from '../taskbarguard';
import { healthLines, type HealthFacts } from '../health';
import { SimulatedExplorer, type SimWindow } from './simulated-explorer';

// Une borne réelle : playfield 4K couché, fronton, DMD (pixels physiques).
const SCREENS: GuardScreen[] = [
  { name: 'Playfield', rect: { x: 0, y: 0, width: 3840, height: 2160 } },
  { name: 'Fronton', rect: { x: 3840, y: 0, width: 1920, height: 1080 } },
  { name: 'DMD', rect: { x: 5760, y: 0, width: 1280, height: 390 } },
];
const ME = 100;
const VPX = 200;

/** Le menu ouvert comme au démarrage : un voile par écran, puis chaque fenêtre, qui prend le premier plan en apparaissant ; le playfield en dernier. */
function startMenu(win: SimulatedExplorer): Map<string, SimWindow> {
  for (const s of SCREENS) win.open(ME, `Cyber Pinball — Fond`, s.rect);
  const menu = new Map(SCREENS.map((s) => [s.name, win.open(ME, `Cyber Pinball — ${s.name}`, s.rect)]));
  for (const name of ['Fronton', 'DMD', 'Playfield']) win.activate(menu.get(name)!);
  return menu;
}

function states(win: SimulatedExplorer): Record<string, string> {
  const stack = win.windows.filter((w) => w.visible);
  return Object.fromEntries(SCREENS.map((s) => [s.name, screenCover(s.rect, stack, [ME]).state]));
}

const ALL_COVERED = { Playfield: 'covered', Fronton: 'covered', DMD: 'covered' };

/** Une partie : barres masquées, VPX prend le premier plan avant son plein écran, puis se ferme. */
function playGame(win: SimulatedExplorer): void {
  for (const bar of win.taskbars()) win.hide(bar);
  const vpx = win.open(VPX, 'Visual Pinball Player', { x: 100, y: 100, width: 1600, height: 900 });
  win.activate(vpx);
  vpx.rect = { ...SCREENS[0]!.rect };
  win.activate(vpx);
  win.close(vpx);
}

test('la cause : au retour d’une partie, la barre du DMD reste devant (ancien retour au menu)', () => {
  const win = new SimulatedExplorer(SCREENS);
  const menu = startMenu(win);
  assert.deepEqual(states(win), ALL_COVERED, 'au démarrage, chaque fenêtre a eu le premier plan : chaque barre est derrière');
  playGame(win);
  // Ancien retour : les barres réaffichées là où l'Explorateur les a laissées, puis le playfield reprend le premier plan.
  for (const bar of win.taskbars()) win.showInactive(bar);
  win.activate(menu.get('Playfield')!);
  assert.deepEqual(states(win), { Playfield: 'covered', Fronton: 'taskbar', DMD: 'taskbar' }, 'le DMD et le fronton n’ont jamais le premier plan : leur barre reste devant');
});

test('le gardien remet chaque barre derrière la fenêtre du menu de son écran, sans rien activer', () => {
  const win = new SimulatedExplorer(SCREENS);
  const menu = startMenu(win);
  playGame(win);
  for (const bar of win.taskbars()) win.showInactive(bar);
  win.activate(menu.get('Playfield')!);
  const guard = new TaskbarGuard(win.layer(), [ME]);
  const focused = win.focused;
  const repairs = guard.check(SCREENS, 'return');
  assert.deepEqual(states(win), ALL_COVERED);
  assert.equal(win.focused, focused, 'le premier plan n’a pas bougé');
  assert.deepEqual(repairs.map((r) => [r.screen, r.action, r.held]), [['Fronton', 'placed', true], ['DMD', 'placed', true]]);
  assert.match(repairNotice(repairs[1]!), /Barre des tâches \(Shell_SecondaryTrayWnd\) devant « Cyber Pinball — DMD » sur l’écran « DMD » \(retour d’une partie\) : remise derrière\./);
  assert.deepEqual(guard.facts(), { repaired: 2, hidden: [], last: { screen: 'DMD', moment: 'return', at: new Date(0).toISOString() } });
  // Rien de plus à faire au passage suivant.
  assert.deepEqual(guard.check(SCREENS, 'watch'), []);
});

test('les barres réaffichées derrière avant d’être montrées : aucun instant devant (nouveau retour au menu)', () => {
  const win = new SimulatedExplorer(SCREENS);
  const menu = startMenu(win);
  playGame(win);
  // restoreTaskbars : chaque barre rangée sous la fenêtre de son écran, puis réaffichée.
  for (const bar of win.taskbars()) {
    const screen = SCREENS.find((s) => bar.rect.x >= s.rect.x && bar.rect.x < s.rect.x + s.rect.width)!;
    win.placeBelow(bar, menu.get(screen.name)!);
    win.showInactive(bar);
    assert.notEqual(states(win)[screen.name], 'taskbar', `${screen.name} : réaffichée derrière`);
  }
  win.activate(menu.get('Playfield')!);
  assert.deepEqual(states(win), ALL_COVERED);
});

test('changement de zone de travail ou d’écrans : les barres repassées devant reviennent derrière', () => {
  const win = new SimulatedExplorer(SCREENS);
  startMenu(win);
  const guard = new TaskbarGuard(win.layer(), [ME]);
  win.workAreaChanged();
  assert.deepEqual(states(win), { Playfield: 'taskbar', Fronton: 'taskbar', DMD: 'taskbar' });
  assert.equal(guard.check(SCREENS, 'displays').length, 3);
  assert.deepEqual(states(win), ALL_COVERED);
});

test('jamais pendant qu’un autre programme a le premier plan : VPX en partie, menu Démarrer', () => {
  const win = new SimulatedExplorer(SCREENS);
  startMenu(win);
  const vpx = win.open(VPX, 'Visual Pinball Player', { x: 100, y: 100, width: 1600, height: 900 });
  win.activate(vpx);
  const guard = new TaskbarGuard(win.layer(), [ME]);
  assert.deepEqual(guard.check(SCREENS, 'vpx'), []);
  assert.deepEqual(win.calls, [], 'rien n’est demandé à Windows');
  const start = win.open(5, 'Démarrer', { x: 0, y: 1400, width: 800, height: 700 });
  start.className = 'Windows.UI.Core.CoreWindow';
  win.activate(start);
  assert.deepEqual(guard.check(SCREENS, 'watch'), []);
  // La fenêtre de VPX fermée, Windows donne le premier plan à la barre des tâches : le gardien agit.
  win.close(start);
  win.close(vpx);
  win.focused = win.taskbarOf('Playfield');
  assert.ok(guardMayAct(win.focused, [ME]));
  assert.equal(guard.check(SCREENS, 'return').length, 3);
  assert.deepEqual(states(win), ALL_COVERED);
});

test('une barre que Windows remet devant sans cesse est masquée, une fois, et la Santé de la borne le dit', () => {
  const win = new SimulatedExplorer(SCREENS);
  startMenu(win);
  win.stubborn = true;
  const hidden: string[] = [];
  const guard = new TaskbarGuard(win.layer((w) => hidden.push(w.className)), [ME]);
  for (let i = 0; i < TASKBAR_REPAIRS_BEFORE_HIDE; i++) {
    win.workAreaChanged();
    const r = guard.check(SCREENS, 'watch');
    assert.ok(r.every((x) => x.action === 'placed'));
    win.tick(500);
  }
  win.workAreaChanged();
  const last = guard.check(SCREENS, 'watch');
  assert.deepEqual(last.map((r) => [r.screen, r.action, r.held]), [['Playfield', 'hidden', true], ['Fronton', 'hidden', true], ['DMD', 'hidden', true]]);
  assert.deepEqual(states(win), ALL_COVERED);
  assert.equal(hidden.length, 3);
  assert.deepEqual(guard.check(SCREENS, 'watch'), [], 'masquées : plus rien devant');
  // Hors de la fenêtre de temps, une nouvelle série recommence par des remises en place.
  const lines = healthLines({ at: '', disks: [], vpx: { installed: '10.8.1', known: '10.8.1' }, screens: { configurations: 1, plugged: 3, taskbars: guard.facts() } } satisfies HealthFacts);
  const bar = lines.find((l) => /barre des tâches/i.test(l.title));
  assert.equal(bar?.state, 'check');
  assert.match(bar!.title, /Windows remettait la barre des tâches devant « Playfield », « Fronton » et « DMD »/);
});

test('Santé de la borne : barres remises derrière, en clair ; rien sans incident', () => {
  const base = { at: '', disks: [], vpx: { installed: '10.8.1', known: '10.8.1' } };
  const none = healthLines({ ...base, screens: { configurations: 1, plugged: 3, taskbars: { repaired: 0, hidden: [] } } });
  assert.ok(!none.some((l) => /barre des tâches/i.test(l.title)));
  const some = healthLines({ ...base, screens: { configurations: 1, plugged: 3, taskbars: { repaired: 2, hidden: [], last: { screen: 'DMD', moment: 'return', at: '2026-10-29T20:00:00.000Z' } } } });
  const line = some.find((l) => /barre des tâches/i.test(l.title));
  assert.equal(line?.state, 'ok');
  assert.match(line!.title, /Barre des tâches remise derrière le menu 2 fois/);
  assert.match(line!.detail ?? '', /la dernière sur « DMD » \(retour d’une partie\)/);
});

test('journal des écrans : premier plan, ce qui est au-dessus de chaque écran, et chaque barre', () => {
  const win = new SimulatedExplorer(SCREENS);
  const menu = startMenu(win);
  playGame(win);
  for (const bar of win.taskbars()) win.showInactive(bar);
  win.activate(menu.get('Playfield')!);
  const stack = win.windows.filter((w) => w.visible);
  const text = stackingReport('return', SCREENS, stack, win.focused, win.taskbars(), [ME], new Date('2026-10-29T20:00:00Z'));
  assert.match(text, /^2026-10-29T20:00:00\.000Z retour d’une partie\npremier plan : « Cyber Pinball — Playfield » \(Chrome_WidgetWin_1, pid 100, HWND \d+\)\n/);
  assert.match(text, /écran « Playfield » \(3840 × 2160 en 0, 0\) : couvert ; sous « Cyber Pinball — Playfield »/);
  assert.match(text, /écran « DMD » \(1280 × 390 en 5760, 0\) : BARRE DES TÂCHES DEVANT ; sous « Cyber Pinball — DMD » .*\n {2}au-dessus : sans titre \(Shell_SecondaryTrayWnd, pid 4, HWND \d+, premier plan permanent\), 1280 × 48 en 5760, 342 \[barre des tâches\]/);
  assert.match(text, /barre Shell_TrayWnd HWND \d+ : 3840 × 48 en 0, 2112, visible\n/);
  assert.ok(text.endsWith('\n\n'), 'une entrée par bascule, séparée par une ligne vide (journal tronqué par entrée entière)');
});

// Règles de l'application (app/src/screen-guard.ts, frontend.ts).
const APP = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
const read = (file: string) => fs.readFileSync(path.join(APP, file), 'utf8');

test('le gardien des écrans range une barre réaffichée sous la fenêtre de son écran avant de la montrer', () => {
  const guard = read('screen-guard.ts');
  const restore = guard.slice(guard.indexOf('export function restoreTaskbars'), guard.indexOf('\n}\n', guard.indexOf('export function restoreTaskbars')));
  assert.ok(restore.indexOf('placeWindowBelow(') >= 0 && restore.indexOf('placeWindowBelow(') < restore.indexOf('showWindowInactive('), 'derrière d’abord, puis réaffichée');
  // Le gardien des barres passe à chaque relecture et à chaque changement d'écrans ou de zone de travail.
  const check = guard.slice(guard.indexOf('function checkScreens'));
  assert.match(check.slice(0, check.indexOf('\n}\n')), /settleTaskbars\(/);
  assert.match(guard, /const displaysChanged = \(\) => \{[^}]*settleTaskbars\('displays'/);
});

test('retour de partie et retour du bureau : le gardien des barres passe une fois le menu revenu', () => {
  const front = read('frontend.ts');
  const back = front.slice(front.indexOf('const result = await game.done'));
  assert.ok(back.indexOf('restoreTaskbars()') < back.indexOf('showMenuAgain()'));
  assert.ok(back.indexOf('showMenuAgain()') < back.indexOf("settleScreens('return')"));
  const desk = front.slice(front.indexOf('function restoreFromDesktop'));
  assert.match(desk.slice(0, desk.indexOf('\n}\n')), /settleScreens\('desktop-back'\)/);
});
