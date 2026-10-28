import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { healthLines } from '../health';
import { setLanguage } from '../i18n';
import type { ObservedDisplay, Rect, RoleId } from '../model';
import { confusableRoles, VPX_ANCILLARY_WINDOWS, VPX_GAME_TITLES, vpxWindowMoves } from '../vpxwindows';

// Poste à 3 écrans (27 octobre 2026) : le fronton et le DMD sont deux PL2294H. VPX 10.8.1 ouvre
// « Window #1 » (Backglass) et « Window #2 » (Score View) sur le premier PL2294H.

/** Écran branché de ce nom, à cette place du bureau. */
function display(gdi: string, name: string, x: number): ObservedDisplay {
  return { gdiName: gdi, friendlyName: name, devicePath: `\\\\?\\DISPLAY#${gdi}`, bounds: { x, y: 0, width: 1920, height: 1080 }, rotation: 0, primary: x === 0 } as ObservedDisplay;
}

const pf = display('\\\\.\\DISPLAY1', 'Generic PnP Monitor', 0);
const bg = display('\\\\.\\DISPLAY2', 'PL2294H', 1920);
const dmd = display('\\\\.\\DISPLAY3', 'PL2294H', 3840);
const observed = [pf, bg, dmd];
const assignments = { playfield: pf, backglass: bg, dmd };
const screens: Partial<Record<RoleId, Rect>> = { playfield: pf.bounds, backglass: bg.bounds, dmd: dmd.bounds };
const displays = observed.map((d) => d.bounds);

test('les titres des fenêtres annexes sont ceux des fenêtres de jeu de VPX, sans le playfield', () => {
  for (const title of Object.keys(VPX_ANCILLARY_WINDOWS)) assert.ok((VPX_GAME_TITLES as readonly string[]).includes(title), title);
  assert.ok(!Object.hasOwn(VPX_ANCILLARY_WINDOWS, 'Visual Pinball Player'));
});

test('rôles que VPX 10.8.1 peut confondre : deux écrans du même nom, ou un écran inutilisé du même modèle', () => {
  assert.deepEqual(confusableRoles(assignments, observed, 'name'), ['backglass', 'dmd']);
  // Une version qui repère aussi la position les distingue.
  assert.deepEqual(confusableRoles(assignments, observed, 'name-position'), []);
  assert.deepEqual(confusableRoles(assignments, observed, undefined), []);
  // Fronton et DMD sur le même écran (zones) : rien à confondre.
  assert.deepEqual(confusableRoles({ playfield: pf, backglass: bg, dmd: bg }, [pf, bg], 'name'), []);
  // Un troisième PL2294H branché mais sans rôle : VPX peut aussi le prendre.
  const spare = display('\\\\.\\DISPLAY4', 'PL2294H', 5760);
  assert.deepEqual(confusableRoles({ playfield: pf, dmd }, [pf, dmd, spare], 'name'), ['dmd']);
});

test('Score View ouverte sur l’écran du fronton : ramenée sur celui du DMD, à la même place et à la même taille', () => {
  const confused = confusableRoles(assignments, observed, 'name');
  const backglass = { title: 'Visual Pinball Backglass', rect: { x: 1920, y: 0, width: 1920, height: 1080 } };
  const scoreView = { title: 'Visual Pinball Score View', rect: { x: 1920 + 320, y: 600, width: 1280, height: 400 } };
  const player = { title: 'Visual Pinball Player', rect: { x: 0, y: 0, width: 1920, height: 1080 } };
  const moves = vpxWindowMoves([player, backglass, scoreView], screens, confused, displays);
  assert.deepEqual(moves, [{ window: scoreView, role: 'dmd', to: { x: 3840 + 320, y: 600, width: 1280, height: 400 } }]);
  // Une fois recalée, elle n'est plus touchée : ce que le joueur règle sur son écran reste.
  assert.deepEqual(vpxWindowMoves([player, backglass, { ...scoreView, rect: moves[0]!.to }], screens, confused, displays), []);
});

test('l’inverse : Backglass ouverte sur l’écran du DMD, ramenée sur le fronton', () => {
  const confused = confusableRoles(assignments, observed, 'name');
  const backglass = { title: 'Visual Pinball Backglass', rect: { x: 3840, y: 0, width: 1920, height: 1080 } };
  const scoreView = { title: 'Visual Pinball Score View', rect: { x: 3840, y: 0, width: 1920, height: 1080 } };
  assert.deepEqual(vpxWindowMoves([backglass, scoreView], screens, confused, displays), [{ window: backglass, role: 'backglass', to: { x: 1920, y: 0, width: 1920, height: 1080 } }]);
});

test('ni rôle confondu, ni fenêtre réduite, ni rôle sans écran : rien ne bouge', () => {
  const scoreView = { title: 'Visual Pinball Score View', rect: { x: 1920, y: 0, width: 1280, height: 400 } };
  // Version de VPX qui distingue les écrans.
  assert.deepEqual(vpxWindowMoves([scoreView], screens, [], displays), []);
  // Fenêtre réduite (GetWindowRect la met à -32000).
  assert.deepEqual(vpxWindowMoves([{ ...scoreView, minimized: true }], screens, ['dmd'], displays), []);
  // Topper ouvert alors que la borne n'a pas de topper.
  const topper = { title: 'Visual Pinball Topper', rect: { x: 1920, y: 0, width: 800, height: 300 } };
  assert.deepEqual(vpxWindowMoves([topper], screens, ['topper'], displays), []);
  // Le playfield n'est jamais déplacé, même confondu.
  const player = { title: 'Visual Pinball Player', rect: { x: 1920, y: 0, width: 1920, height: 1080 } };
  assert.deepEqual(vpxWindowMoves([player], screens, ['playfield'], displays), []);
});

test('une fenêtre qui déborderait de l’écran du rôle y est ramenée entière', () => {
  // Écran du DMD plus petit que celui du fronton.
  const small: Partial<Record<RoleId, Rect>> = { ...screens, dmd: { x: 3840, y: 0, width: 1366, height: 768 } };
  const scoreView = { title: 'Visual Pinball Score View', rect: { x: 1920 + 1000, y: 700, width: 800, height: 300 } };
  const [move] = vpxWindowMoves([scoreView], small, ['dmd'], [pf.bounds, bg.bounds, small.dmd!]);
  assert.deepEqual(move?.to, { x: 3840 + 1366 - 800, y: 768 - 300, width: 800, height: 300 });
  // Plus grande que l'écran : posée dans son coin.
  const [big] = vpxWindowMoves([{ ...scoreView, rect: { x: 1920, y: 0, width: 1920, height: 1080 } }], small, ['dmd'], [pf.bounds, bg.bounds, small.dmd!]);
  assert.deepEqual(big?.to, { x: 3840, y: 0, width: 1920, height: 1080 });
});

test('santé de la borne : deux écrans confondus sont dits recalés à chaque partie, le playfield excepté', () => {
  setLanguage('fr');
  const active = { name: 'Poste à 3 écrans', total: 3, found: 3, missing: [], extra: 0, playfieldFound: true };
  const lineFor = (roles: RoleId[]) =>
    healthLines({ at: '2026-10-28T12:00:00Z', disks: [], screens: { configurations: 1, plugged: 3, active, homonyms: [{ name: 'PL2294H', roles }] }, vpx: {} }).filter((l) => l.check === 'screens')
      .at(-1)!;
  const both = lineFor(['backglass', 'dmd']);
  assert.equal(both.state, 'check');
  assert.match(both.title, /VPX confond deux écrans « PL2294H »/);
  assert.match(both.detail ?? '', /recalé à chaque partie/);
  assert.match(lineFor(['playfield', 'backglass']).detail ?? '', /pas le playfield/);
  setLanguage('en');
  assert.match(lineFor(['backglass', 'dmd']).detail ?? '', /realigned at every game/);
  setLanguage('fr');
});

const APP = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
const WIN = path.join(__dirname, '..', '..', '..', 'win-displays', 'src', 'windows.ts');

test('pendant la partie, le menu recale les fenêtres de VPX sans leur prendre le focus ni changer leur ordre', () => {
  const frontend = fs.readFileSync(path.join(APP, 'frontend.ts'), 'utf8');
  const watch = frontend.slice(frontend.indexOf('function watchOccupied('), frontend.indexOf('function watchDressing('));
  assert.match(watch, /realignVpxWindows\(/, 'watchOccupied recale les fenêtres à chaque relecture de la pile');
  assert.match(frontend, /vpxWindowMoves\(/);
  assert.match(frontend, /confusableRoles\(/);
  const windows = fs.readFileSync(WIN, 'utf8');
  const move = windows.slice(windows.indexOf('export function moveWindow('));
  assert.match(move.slice(0, move.indexOf('\n}\n')), /SWP_NOACTIVATE \| SWP_NOZORDER \| SWP_NOSIZE \| SWP_NOOWNERZORDER \| SWP_ASYNCWINDOWPOS/);
});
