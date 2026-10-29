// Démonstration sans opérateur du gardien des barres des tâches (docs\demo-barre-dessus.ps1) :
// une borne réelle (playfield 4K, fronton, DMD) sur un Windows simulé dont l'Explorateur suit
// sa règle pour ses barres (packages/core/src/test/simulated-explorer.ts). Aucune fenêtre n'est
// ouverte, aucune vraie barre des tâches n'est touchée.
//   node docs\demo-barre-dessus.cjs <dossier de sortie> [scénario…]
// Écrit <sortie>\<scénario>\ecrans.txt (le journal des écrans, comme sur la borne) et rend 1 si
// un scénario ne finit pas comme prévu.

const fs = require('node:fs');
const path = require('node:path');
const core = require('../packages/core/dist/index.js');
const { SimulatedExplorer } = require('../packages/core/dist/test/simulated-explorer.js');

const SCREENS = [
  { name: 'Playfield', rect: { x: 0, y: 0, width: 3840, height: 2160 } },
  { name: 'Fronton', rect: { x: 3840, y: 0, width: 1920, height: 1080 } },
  { name: 'DMD', rect: { x: 5760, y: 0, width: 1280, height: 390 } },
];
const ME = 100;
const VPX = 200;

function startMenu(win) {
  for (const s of SCREENS) win.open(ME, 'Cyber Pinball — Fond', s.rect);
  const menu = new Map(SCREENS.map((s) => [s.name, win.open(ME, `Cyber Pinball — ${s.name}`, s.rect)]));
  for (const name of ['Fronton', 'DMD', 'Playfield']) win.activate(menu.get(name));
  return menu;
}

function playGame(win, journal) {
  for (const bar of win.taskbars()) win.hide(bar);
  journal('game');
  const vpx = win.open(VPX, 'Visual Pinball Player', { x: 100, y: 100, width: 1600, height: 900 });
  win.activate(vpx);
  vpx.rect = { ...SCREENS[0].rect };
  win.activate(vpx);
  journal('vpx');
  win.close(vpx);
}

function states(win) {
  const stack = win.windows.filter((w) => w.visible);
  return SCREENS.map((s) => `${s.name} ${core.screenCover(s.rect, stack, [ME]).state}`).join(', ');
}

/** Chaque scénario rend l'état final des écrans attendu et ce qu'il a fait. */
const SCENARIOS = {
  // Le retour d'une partie d'avant le correctif : barres réaffichées telles quelles, playfield au premier plan.
  avant(win, guard, journal) {
    const menu = startMenu(win);
    journal('start');
    playGame(win, journal);
    for (const bar of win.taskbars()) win.showInactive(bar);
    win.activate(menu.get('Playfield'));
    journal('return');
    return 'Playfield covered, Fronton taskbar, DMD taskbar';
  },
  // Le retour d'aujourd'hui : chaque barre rangée sous la fenêtre de son écran avant d'être réaffichée, puis le gardien.
  apres(win, guard, journal) {
    const menu = startMenu(win);
    journal('start');
    for (let game = 0; game < 10; game++) {
      playGame(win, journal);
      const rects = SCREENS.map((s) => s.rect);
      const stack = win.windows.filter((w) => w.visible);
      for (const bar of win.taskbars()) {
        const under = core.coveringWindow(core.displayOf(bar.rect, rects), stack, [ME]);
        if (under) win.placeBelow(bar, under);
        win.showInactive(bar);
      }
      win.activate(menu.get('Playfield'));
      journal('return');
      report(guard.check(SCREENS, 'return'));
      win.tick(60_000);
    }
    return 'Playfield covered, Fronton covered, DMD covered';
  },
  // L'ancien retour, rattrapé par le gardien des barres seul (filet de sauvegarde).
  filet(win, guard, journal) {
    const menu = startMenu(win);
    playGame(win, journal);
    for (const bar of win.taskbars()) win.showInactive(bar);
    win.activate(menu.get('Playfield'));
    journal('return');
    report(guard.check(SCREENS, 'return'));
    journal('return');
    return 'Playfield covered, Fronton covered, DMD covered';
  },
  // Zone de travail changée (écran tourné, rebranché) : l'Explorateur remet ses barres devant tout.
  zone(win, guard, journal) {
    startMenu(win);
    win.workAreaChanged();
    journal('displays');
    report(guard.check(SCREENS, 'displays'));
    return 'Playfield covered, Fronton covered, DMD covered';
  },
  // VPX au premier plan : le gardien ne touche à rien, même avec une barre devant.
  vpx(win, guard, journal) {
    startMenu(win);
    const vpx = win.open(VPX, 'Visual Pinball Player', { x: 100, y: 100, width: 1600, height: 900 });
    win.activate(vpx);
    journal('vpx');
    const done = guard.check(SCREENS, 'watch');
    report(done);
    if (done.length || win.calls.length) throw new Error('le gardien a agi pendant que VPX avait le premier plan');
    return 'Playfield taskbar, Fronton taskbar, DMD taskbar';
  },
  // L'Explorateur remet aussitôt devant chaque barre rangée : après cinq remises en place, elle est masquée.
  tenace(win, guard, journal) {
    startMenu(win);
    win.stubborn = true;
    for (let i = 0; i <= core.TASKBAR_REPAIRS_BEFORE_HIDE; i++) {
      win.workAreaChanged();
      report(guard.check(SCREENS, 'watch'));
      win.tick(500);
    }
    journal('watch');
    return 'Playfield covered, Fronton covered, DMD covered';
  },
};

let out = [];
function report(repairs) {
  for (const r of repairs) out.push(`   ${core.repairNotice(r)}`);
}

const [dir, ...wanted] = process.argv.slice(2);
if (!dir) throw new Error('Usage : node docs\\demo-barre-dessus.cjs <dossier de sortie> [scénario…]');
let failed = 0;
for (const name of wanted.length ? wanted : Object.keys(SCENARIOS)) {
  const win = new SimulatedExplorer(SCREENS);
  const guard = new core.TaskbarGuard(win.layer(), [ME]);
  const log = path.join(dir, name, core.SCREENS_LOG_FILE);
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.rmSync(log, { force: true });
  const journal = (moment) => core.appendErrorLog(log, core.stackingReport(moment, SCREENS, win.windows.filter((w) => w.visible), win.focused, win.taskbars(), [ME], new Date(Date.UTC(2026, 9, 29, 20) + win['clock'])));
  out = [];
  const expected = SCENARIOS[name](win, guard, journal);
  const got = states(win);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`== ${name} : ${got}${ok ? '' : `  ÉCHEC, attendu : ${expected}`}`);
  for (const line of out.slice(0, 8)) console.log(line);
  if (out.length > 8) console.log(`   … ${out.length - 8} autres`);
  const facts = guard.facts();
  console.log(`   Santé de la borne : ${core.healthLines({ at: '', disks: [], vpx: { installed: '10.8.1' }, screens: { configurations: 1, plugged: 3, taskbars: facts } }).filter((l) => /barre des tâches/i.test(l.title)).map((l) => `${l.state} « ${l.title} »`).join(' ; ') || 'aucune ligne'}`);
  console.log(`   journal : ${log}`);
}
process.exit(failed ? 1 : 0);
