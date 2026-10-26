// Mode bureau (menu système > « Bureau Windows », ou Ctrl+Maj+D). Signalement du 26/10/2026 :
// en mode bureau, souvent un seul écran du PC revenait. Seules les fenêtres du menu étaient
// réduites ; les voiles noirs du gardien des écrans (un par écran, app/src/screen-guard.ts)
// restaient en plein écran et cachaient le bureau des autres. Ces tests fixent l'invariant
// avec les écrans simulés de docs\ecrans (ceux de CYBERPINBALL_DISPLAYS), de 1 à 4 écrans :
// au bureau, aucune fenêtre de Cyber Pinball ne recouvre plus rien ; au retour, chaque écran
// est de nouveau couvert, son voile remis avant sa fenêtre.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { joystickCode } from '../buttons';
import { parseSimulatedDisplays } from '../offscreen';
import { desktopBlockers, screenCover, type CoverRect, type StackedWindow } from '../screencover';
import { accelerator, matchesShortcut, shortcutKeys, shortcutLabel, shownKeys, SHORTCUTS } from '../shortcuts';
import { REPO_ROOT } from './i18n-scan';

const ME = 4242;

/** Fenêtre de l'application simulée : ce que le mode bureau en lit et en fait. */
class FakeWindow {
  visible = true;
  minimized = false;
  destroyed = false;
  constructor(
    readonly title: string,
    readonly rect: CoverRect,
    readonly veil: boolean,
  ) {}
  isDestroyed(): boolean {
    return this.destroyed;
  }
  isMinimized(): boolean {
    return this.minimized;
  }
}

interface DesktopModeLike {
  readonly active: boolean;
  enter(): void;
  clear(): FakeWindow[];
  reopened(): boolean;
  leave(): void;
}

// Compilé avec l'application (npm test construit tout avant de lancer les tests), sans electron.
const { DesktopMode } = require(path.join(REPO_ROOT, 'app', 'dist', 'desktop-mode.js')) as {
  DesktopMode: new (options: object) => DesktopModeLike;
};

/** Une borne simulée : un voile par écran, puis les fenêtres du menu par-dessus. */
function cabinet(screens: CoverRect[], menuScreens: CoverRect[]) {
  const veils = screens.map((r, i) => new FakeWindow(`Cyber Pinball — Fond ${i + 1}`, r, true));
  const menu = menuScreens.map((r, i) => new FakeWindow(i === 0 ? 'Cyber Pinball — Playfield' : `Cyber Pinball — Écran ${i + 1}`, r, false));
  const all = [...menu, ...veils];
  const log: string[] = [];
  const mode = new DesktopMode({
    windows: () => all,
    isShown: (w: FakeWindow) => w.visible,
    isVeil: (w: FakeWindow) => w.veil,
    hideVeil: (w: FakeWindow) => {
      w.visible = false;
      log.push(`cache ${w.title}`);
    },
    minimizeWindow: (w: FakeWindow) => {
      w.minimized = true;
      log.push(`réduit ${w.title}`);
    },
    showVeil: (w: FakeWindow) => {
      w.visible = true;
      log.push(`montre ${w.title}`);
    },
    restoreWindow: (w: FakeWindow) => {
      w.minimized = false;
      log.push(`rouvre ${w.title}`);
    },
    raiseWindow: (w: FakeWindow) => {
      log.push(`devant ${w.title}`);
    },
  });
  /** Pile des fenêtres telle que Windows la donnerait : le menu au-dessus des voiles, seulement ce qui est visible. */
  const stack = (): StackedWindow[] => all.filter((w) => !w.destroyed && w.visible).map((w) => ({ pid: ME, className: 'Chrome_WidgetWin_1', title: w.title, rect: w.rect, minimized: w.minimized }));
  return { veils, menu, all, log, mode, stack };
}

/** Jeux d'écrans simulés versionnés (CYBERPINBALL_DISPLAYS), de 1 à 4 écrans ; 2 écrans : les deux premiers du poste à trois. */
function screenSets(): { name: string; screens: CoverRect[] }[] {
  const load = (file: string) => parseSimulatedDisplays(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'ecrans', file), 'utf8')), file).map((d) => d.bounds);
  const three = load('poste-deux-ecrans.json');
  const sets = [
    { name: 'un écran', screens: load('un-ecran.json') },
    { name: 'deux écrans', screens: three.slice(0, 2) },
    { name: 'trois écrans', screens: three },
    { name: 'PC de développement, quatre écrans', screens: load('pc-dev.json') },
    { name: 'borne, quatre écrans', screens: load('borne.json') },
  ];
  assert.deepEqual(
    sets.map((s) => s.screens.length),
    [1, 2, 3, 4, 4],
  );
  return sets;
}

for (const { name, screens } of screenSets()) {
  // Le menu ne couvre que les écrans de la borne : le dernier écran du PC n'a que son voile
  // (moniteur de travail hors de la borne), cas du signalement.
  const menuScreens = screens.length > 1 ? screens.slice(0, -1) : screens;

  test(`mode bureau, ${name} : chaque écran du PC est libéré, puis de nouveau couvert au retour`, () => {
    const { mode, stack, log, veils, menu } = cabinet(screens, menuScreens);
    for (const s of screens) assert.equal(screenCover(s, stack(), [ME]).state, 'covered', 'au menu, chaque écran est couvert');

    mode.enter();
    assert.ok(mode.active);
    for (const s of screens) {
      assert.deepEqual(desktopBlockers(s, stack(), [ME]), [], `écran ${s.x}, ${s.y} : rien de Cyber Pinball ne doit le couvrir`);
      assert.equal(screenCover(s, stack(), [ME]).state, 'uncovered');
    }
    // Les voiles sont cachés (pas de bouton dans la barre des tâches), les fenêtres du menu réduites.
    assert.ok(veils.every((v) => !v.visible && !v.minimized));
    assert.ok(menu.every((w) => w.minimized));
    assert.equal(mode.reopened(), false);

    mode.leave();
    assert.equal(mode.active, false);
    for (const s of screens) assert.equal(screenCover(s, stack(), [ME]).state, 'covered', `écran ${s.x}, ${s.y} : couvert de nouveau`);
    // Les voiles d'abord : aucun écran ne montre le bureau entre une fenêtre et la suivante.
    const lastVeil = Math.max(...log.map((l, i) => (l.startsWith('montre') ? i : -1)));
    const firstWindow = log.findIndex((l) => l.startsWith('rouvre'));
    assert.ok(lastVeil < firstWindow, log.join(' / '));
    // Chaque fenêtre du menu repasse devant les voiles, sans quoi un voile remontré cacherait le playfield rouvert.
    for (const w of menu) assert.ok(log.lastIndexOf(`devant ${w.title}`) > lastVeil, log.join(' / '));
  });
}

test('mode bureau : ce qui revient sur un écran pendant le bureau est rangé de nouveau, et constaté', () => {
  const screens = screenSets()[3]!.screens;
  const { mode, stack, veils, all } = cabinet(screens, screens.slice(0, 2));
  mode.enter();
  // Voile d'un écran rebranché, fenêtre ouverte depuis (navigateur intégré…) : de nouveau visibles.
  veils[2]!.visible = true;
  const browser = new FakeWindow('Cyber Pinball — Récupérer', screens[1]!, false);
  all.push(browser);
  assert.notDeepEqual(desktopBlockers(screens[2]!, stack(), [ME]), [], 'le constat voit l’écran couvert');
  assert.deepEqual(
    mode.clear().map((w) => w.title).sort(),
    ['Cyber Pinball — Fond 3', 'Cyber Pinball — Récupérer'],
  );
  for (const s of screens) assert.deepEqual(desktopBlockers(s, stack(), [ME]), []);
  // Un voile revenu ne ramène pas le menu ; le playfield rouvert depuis la barre des tâches, si.
  assert.equal(mode.reopened(), false);
  all[0]!.minimized = false;
  assert.equal(mode.reopened(), true);
  mode.leave();
  for (const s of screens) assert.equal(screenCover(s, stack(), [ME]).state, 'covered');
  assert.equal(browser.minimized, false, 'la fenêtre rangée au bureau revient avec le menu');
});

test('mode bureau : réduire seulement les fenêtres du menu laissait les écrans couverts (le défaut signalé)', () => {
  const screens = screenSets()[3]!.screens;
  const { stack, menu } = cabinet(screens, screens.slice(0, 3));
  for (const w of menu) w.minimized = true;
  // Le voile de chaque écran reste : le bureau ne se voit sur aucun, sauf là où une autre fenêtre passe devant.
  for (const s of screens) assert.equal(desktopBlockers(s, stack(), [ME]).length, 1);
});

test('mode bureau : toutes les fenêtres de l’application, voiles compris, sans liste à tenir à jour', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(source, /new DesktopMode<BrowserWindow>\(\{\s*windows: \(\) => BrowserWindow\.getAllWindows\(\)/, 'le mode bureau parcourt BrowserWindow.getAllWindows()');
  assert.match(source, /isShown,\s*isVeil,\s*hideVeil: hideCovered,\s*showVeil: \(win\) => win\.showInactive\(\),\s*minimizeWindow: minimizeCovered,/);
  // Le gardien des écrans ne remontre pas un voile en mode bureau.
  const guard = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'screen-guard.ts'), 'utf8');
  assert.match(guard, /desktopMode \|\| win\.showInactive\(\)/);
});

test('raccourcis : une seule définition pour l’accélérateur, la reconnaissance et l’affichage', () => {
  assert.equal(accelerator(SHORTCUTS.desktop), 'Control+Shift+D');
  assert.equal(accelerator(SHORTCUTS.forceStop), 'Control+Shift+K');
  assert.deepEqual(shortcutKeys(SHORTCUTS.desktop), ['Ctrl', 'Maj', 'D']);
  assert.equal(shortcutLabel(SHORTCUTS.desktop), 'Ctrl+Maj+D');
  assert.ok(matchesShortcut({ code: 'KeyD', control: true, shift: true }, SHORTCUTS.desktop));
  assert.ok(!matchesShortcut({ code: 'KeyD', control: true }, SHORTCUTS.desktop));
  assert.ok(!matchesShortcut({ code: 'KeyD', control: true, shift: true, alt: true }, SHORTCUTS.desktop));
  assert.ok(!matchesShortcut({ code: 'KeyD' }, SHORTCUTS.desktop));
  // Touches de l'interface : la touche du clavier ; un bouton de joystick seul ne s'affiche pas.
  assert.deepEqual(shownKeys(['KeyR']), ['R']);
  assert.deepEqual(shownKeys([joystickCode('SDLJoy_' + '0'.repeat(32) + '_0', 13), 'KeyH', 'F1']), ['H']);
  assert.deepEqual(shownKeys([joystickCode('SDLJoy_' + '0'.repeat(32) + '_0', 13)]), []);
});

test('raccourcis : aucun raccourci écrit en dur dans l’interface, tous viennent de SHORTCUTS', () => {
  const dir = path.join(REPO_ROOT, 'app', 'src');
  const offenders = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .flatMap((f) =>
      fs
        .readFileSync(path.join(dir, f), 'utf8')
        .split('\n')
        .flatMap((line, i) => (/globalShortcut\.(un)?register\('|t\('Ctrl\+|'Control\+/.test(line) ? [`${f}:${i + 1} ${line.trim()}`] : [])),
    );
  assert.deepEqual(offenders, [], 'utiliser accelerator(SHORTCUTS.x) et shortcutLabel(SHORTCUTS.x) de packages/core/src/shortcuts.ts');
});
