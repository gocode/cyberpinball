import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { coverNotice, screenCover, veiledScreens, type StackedWindow } from '../screencover';

// Écrans du PC de développement (pixels physiques) : playfield principal, topper à droite.
const PLAYFIELD = { x: 0, y: 0, width: 1920, height: 1080 };
const TOPPER = { x: 1920, y: 0, width: 1920, height: 1080 };
const ME = 100;
const VPX = 200;

function win(pid: number, className: string, rect: StackedWindow['rect'], minimized = false): StackedWindow {
  return { pid, className, title: '', rect, minimized };
}

test("écran couvert par une fenêtre de Cyber Pinball, même sous la fenêtre de jeu de VPX", () => {
  const stack = [win(VPX, 'SDL_app', PLAYFIELD), win(ME, 'Chrome_WidgetWin_1', PLAYFIELD), win(ME, 'Chrome_WidgetWin_1', TOPPER)];
  assert.equal(screenCover(PLAYFIELD, stack, [ME]).state, 'covered');
  assert.equal(screenCover(TOPPER, stack, [ME]).state, 'covered');
});

test('la barre des tâches au-dessus de la fenêtre qui couvre l’écran se voit', () => {
  const taskbar = win(4, 'Shell_SecondaryTrayWnd', { x: 1920, y: 1032, width: 1920, height: 48 });
  const stack = [taskbar, win(ME, 'Chrome_WidgetWin_1', TOPPER), win(ME, 'Chrome_WidgetWin_1', PLAYFIELD)];
  assert.deepEqual(screenCover(TOPPER, stack, [ME]), { state: 'taskbar', taskbar, under: stack[1] });
  // Elle n'est que sur son écran : le playfield reste couvert.
  assert.equal(screenCover(PLAYFIELD, stack, [ME]).state, 'covered');
  // Passée derrière la fenêtre plein écran, elle ne se voit plus.
  assert.equal(screenCover(TOPPER, [stack[1]!, taskbar], [ME]).state, 'covered');
  assert.match(coverNotice({ state: 'taskbar', taskbar }) ?? '', /barre des tâches/);
});

test('sans fenêtre de Cyber Pinball sur un écran, le bureau se voit', () => {
  // Fenêtre plus petite que l'écran, fenêtre réduite, fenêtre d'un autre programme : rien ne couvre.
  const stack = [
    win(ME, 'Chrome_WidgetWin_1', { ...TOPPER, height: 1032 }),
    win(ME, 'Chrome_WidgetWin_1', TOPPER, true),
    win(999, 'Notepad', TOPPER),
    win(4, 'Progman', { x: -1920, y: -768, width: 5760, height: 1848 }),
  ];
  assert.deepEqual(screenCover(TOPPER, stack, [ME]), { state: 'uncovered' });
  assert.match(coverNotice(screenCover(TOPPER, stack, [ME])) ?? '', /bureau Windows/);
  assert.equal(coverNotice(screenCover(TOPPER, [win(ME, 'x', { x: 0, y: 0, width: 3840, height: 1080 })], [ME])), undefined);
});

// Règles de l'application qui gardent les écrans couverts (app/src/screen-guard.ts).
const SOURCES = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
function appSources(): { file: string; text: string }[] {
  return fs
    .readdirSync(SOURCES)
    .filter((f) => f.endsWith('.ts'))
    .map((file) => ({ file, text: fs.readFileSync(path.join(SOURCES, file), 'utf8') }));
}
function offending(pattern: RegExp, allowed: string[] = []): string[] {
  return appSources()
    .filter((s) => !allowed.includes(s.file))
    .flatMap((s) => s.text.split('\n').flatMap((line, i) => (pattern.test(line) && !line.trim().startsWith('//') ? [`${s.file}:${i + 1} ${line.trim()}`] : [])));
}

test('aucune fenêtre n’est masquée : un écran sans fenêtre montrerait le bureau', () => {
  assert.deepEqual(offending(/\.hide\(\)/, ['cover-display.ts']), [], 'garder la fenêtre (derrière VPX), ou la fermer si le gardien couvre son écran');
  // Seule exception : hideCovered, pour le mode bureau (desktop-mode.ts), où le bureau doit justement se voir.
  const cover = fs.readFileSync(path.join(SOURCES, 'cover-display.ts'), 'utf8');
  assert.equal(cover.match(/\.hide\(\)/g)?.length, 1);
  assert.match(cover, /export function hideCovered\(win: BrowserWindow\): void \{[^}]*win\.hide\(\);\s*\}/);
  assert.deepEqual(offending(/hideCovered\b/, ['cover-display.ts']).filter((l) => !/^frontend\.ts:\d+ (import .*|hideVeil: hideCovered,)$|^desktop-mode\.ts:\d+ \/\*\*/.test(l)), [], 'hideCovered ne sert qu’au mode bureau');
});

test('l’application ne se relance que par relaunchCovered : le bureau se verrait entre les deux processus', () => {
  assert.deepEqual(offending(/app\.relaunch\(/, ['screen-guard.ts']), [], 'utiliser relaunchCovered(args) de app/src/screen-guard.ts');
});

test('écran rebranché pendant une partie : un écran de la borne resté noir sous son voile est repéré', () => {
  const VEIL = 'Cyber Pinball — Fond';
  const FULLDMD = { x: -1920, y: 0, width: 1920, height: 1080 };
  const titled = (title: string, rect: StackedWindow['rect']): StackedWindow => ({ ...win(ME, 'Chrome_WidgetWin_1', rect), title });
  const screens = [
    { name: 'FullDMD', rect: FULLDMD, role: true },
    { name: 'Topper', rect: TOPPER, role: true },
    { name: 'sans rôle', rect: { x: 3840, y: 0, width: 1920, height: 1080 }, role: false },
  ];
  // Le cas relevé : le voile neuf du FullDMD devant sa fenêtre ; le Topper à sa place ; l'écran sans rôle n'a que son voile.
  const stack = [titled(VEIL, FULLDMD), titled('Cyber Pinball — FullDMD', FULLDMD), titled('Cyber Pinball — Topper', TOPPER), titled(VEIL, TOPPER), titled(VEIL, screens[2]!.rect)];
  assert.deepEqual(veiledScreens(screens, stack, [ME], VEIL).map((s) => s.name), ['FullDMD']);
  // Fenêtre chassée de son écran : le voile est seul à le couvrir.
  assert.deepEqual(veiledScreens(screens, [titled('Cyber Pinball — Topper', TOPPER), titled(VEIL, FULLDMD)], [ME], VEIL).map((s) => s.name), ['FullDMD']);
  // Tout en ordre.
  assert.deepEqual(veiledScreens(screens, stack.slice(1), [ME], VEIL), []);
});

test('écran rebranché : voile neuf sous les fenêtres du menu, fenêtres reprises hors partie et au retour', () => {
  const guard = fs.readFileSync(path.join(SOURCES, 'screen-guard.ts'), 'utf8');
  // Le voile neuf passe sous la plus basse fenêtre de Cyber Pinball, juste après être montré.
  assert.match(guard, /win\.showInactive\(\);\s*tuckVeil\(win\);/);
  // Les noms des écrans suivent leur place, pas leur identifiant (un écran rebranché en change).
  assert.match(guard, /const names = new Map<string, string>\(\);/);
  assert.match(guard, /names\.set\(rectKey\(/);
  // Les écrans posés, le menu est prévenu ; recoverScreens reprend fenêtres et voiles.
  assert.match(guard, /for \(const listener of settledListeners\) listener\(\);/);
  assert.match(guard, /recoverCovered\(present, \(win\) => !veilSet\.has\(win\)\)/);
  assert.match(guard, /veiledScreens\(screens, listWindows/);
  const frontend = fs.readFileSync(path.join(SOURCES, 'frontend.ts'), 'utf8');
  // Hors lancement et hors partie seulement : le premier plan va à VPX.
  assert.match(frontend, /onScreensSettled\(\(\) => playing \|\| launch \|\| recoverScreens\('displays'\)\)/);
  // Au retour d'une partie, aussitôt puis une fois les écrans posés.
  assert.match(frontend, /settleScreens\('return'\);[\s\S]{0,300}recoverScreens\('return'\);\s*setTimeout\(\(\) => playing \|\| recoverScreens\('return'\), SCREENS_SETTLE_MS\);/);
  // Chaque fenêtre suivie par coverDisplay peut être reprise.
  const cover = fs.readFileSync(path.join(SOURCES, 'cover-display.ts'), 'utf8');
  assert.match(cover, /tracked\.add\(win\);\s*win\.once\('closed', \(\) => tracked\.delete\(win\)\);/);
});

test('le gardien des écrans démarre avant toute autre fenêtre', () => {
  const main = fs.readFileSync(path.join(SOURCES, 'main.ts'), 'utf8');
  const ready = main.slice(main.indexOf('app.whenReady()'));
  assert.ok(ready.indexOf('guardScreens(') >= 0, 'main.ts appelle guardScreens() dans app.whenReady');
  for (const start of ['startSettingsAlone(', 'startWizard(', 'startFrontend(']) assert.ok(ready.indexOf('guardScreens(') < ready.indexOf(start), `guardScreens() avant ${start}`);
});
