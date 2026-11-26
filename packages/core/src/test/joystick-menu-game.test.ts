/** The real joystick dispatcher with a fake SDL reader: no native library or hardware is opened. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

interface Input { code: string; type: string; isAutoRepeat: boolean }
interface Window { shown: boolean; closed?: () => void; once(event: string, callback: () => void): void; isDestroyed(): boolean }
interface Api {
  onJoystickInput(window: Window, listener: (input: Input) => void, accepts?: () => boolean): void;
  watchJoystickButtons(listener: (code: string, down: boolean) => void): () => void;
  joystickButtonsHeld(): string[];
}
function fixture(offscreen = false) {
  let now = 10_000, focused: Window | undefined, tick: () => void = () => undefined;
  const events: { device: string; button: number; down: boolean }[] = [];
  const focus: Window[] = [];
  const api = {} as Api;
  const reader = { version: 'fake', devices: () => [], poll: () => events.splice(0) };
  const modules: Record<string, unknown> = {
    'node:path': path,
    electron: { BrowserWindow: { getFocusedWindow: () => focused } },
    '@cyberpinball/core': { joystickCode: (_device: string, button: number) => `button-${button}` },
    '@cyberpinball/win-displays': { openJoysticks: () => reader, sdlLibraryIn: () => 'fake' },
    './foreground': { keyboardFollows: (window: Window) => { focus.push(window); return true; } },
    './offscreen': { OFFSCREEN: offscreen, isShown: (window: Window) => window.shown },
    './paths': { locations: () => ({}), vpxInstall: () => ({ exe: 'fake' }) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'app/dist/joystick-input.js'), 'utf8'), {
    exports: api,
    require: (name: string) => { assert.ok(name in modules, `Unexpected native dependency: ${name}`); return modules[name]; },
    process: { env: {} }, console: { log: () => undefined, warn: () => undefined },
    Date: { now: () => now },
    setInterval: (callback: () => void) => { tick = callback; return { unref: () => undefined }; },
  });
  return {
    api, focus,
    window(): Window { return { shown: true, once(_event, callback) { this.closed = callback; }, isDestroyed: () => false }; },
    foreground(window?: Window) { focused = window; },
    button(down: boolean, button = 2) { events.push({ device: 'fake', button, down }); tick(); },
    advance(ms: number) { now += ms; tick(); },
  };
}

test('menu suspended during a game never receives joystick input or reclaims focus, including repeats', () => {
  const f = fixture(), menu = f.window(), inputs: Input[] = [];
  let phase = 'playing';
  f.api.onJoystickInput(menu, (input) => inputs.push(input), () => phase !== 'playing');
  f.foreground(menu); // Electron can still report the menu as focused while VPX owns the keyboard.
  f.button(true); f.advance(600); f.button(false);
  assert.equal(inputs.length, 0);
  assert.equal(f.focus.length, 0);
  phase = 'menu';
  f.button(true); f.button(false);
  assert.deepEqual(inputs.map((input) => input.type), ['keyDown', 'keyUp']);
  assert.equal(f.focus.length, 1, 'the menu can recover keyboard focus again after the game');
});

test('global joystick observers and held buttons remain available while menu input is suspended', () => {
  const f = fixture(), menu = f.window(), seen: boolean[] = [];
  f.api.onJoystickInput(menu, () => assert.fail('menu input during game'), () => false);
  f.foreground(menu);
  const stop = f.api.watchJoystickButtons((_code, down) => seen.push(down));
  f.button(true);
  assert.deepEqual(Array.from(f.api.joystickButtonsHeld()), ['button-2']);
  f.button(false);
  assert.equal(f.api.joystickButtonsHeld().length, 0);
  assert.deepEqual(seen, [true, false], 'Exit and the in-game shortcut keep receiving press and release');
  stop(); f.button(true);
  assert.deepEqual(seen, [true, false]);
});

test('an in-game settings window keeps its own input subscription and default focus recovery', () => {
  const f = fixture(), menu = f.window(), settings = f.window(), inputs: Input[] = [];
  f.api.onJoystickInput(menu, () => assert.fail('background menu'), () => false);
  f.api.onJoystickInput(settings, (input) => inputs.push(input));
  f.foreground(settings);
  f.button(true); f.advance(600); f.button(false);
  assert.deepEqual(inputs.map((input) => [input.type, input.isAutoRepeat]), [['keyDown', false], ['keyDown', true], ['keyUp', false]]);
  assert.deepEqual(f.focus, [settings], 'only the initial press requests keyboard focus');
});

test('no focused Cyber window means no menu input, and a closed subscription is removed', () => {
  const f = fixture(), menu = f.window(), inputs: Input[] = [];
  f.api.onJoystickInput(menu, (input) => inputs.push(input));
  f.button(true); f.button(false);
  assert.equal(inputs.length, 0);
  f.foreground(menu); menu.closed!();
  f.button(true); f.button(false);
  assert.equal(inputs.length, 0);
  assert.equal(f.focus.length, 0);
});

test('offscreen fallback also respects suspended subscriptions', () => {
  const f = fixture(true), menu = f.window();
  f.api.onJoystickInput(menu, () => assert.fail('suspended offscreen input'), () => false);
  f.button(true); f.button(false);
  assert.equal(f.focus.length, 0);
});

test('loading keeps Exit input and the ordinary keyboard-focus recovery', () => {
  const f = fixture(), menu = f.window(), inputs: Input[] = [];
  let phase = 'loading';
  f.api.onJoystickInput(menu, (input) => inputs.push(input), () => phase !== 'playing');
  f.foreground(menu);
  f.button(true); f.button(false);
  assert.deepEqual(inputs.map((input) => input.type), ['keyDown', 'keyUp']);
  assert.equal(f.focus.length, 1);
  phase = 'playing';
  f.button(true); f.button(false);
  assert.equal(inputs.length, 2, 'the same subscription is suspended when native play begins');
});

test('the cabinet frontend suspends only its menu subscription while a native game is active', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app/src/frontend.ts'), 'utf8');
  assert.match(source, /onJoystickInput\(win,.*\(\) => state\.phase !== 'playing'\);/);
});
