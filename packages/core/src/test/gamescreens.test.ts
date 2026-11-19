// Écrans de la borne pendant une partie (gamescreens.ts, app/src/game-screens.ts).
//
// Cas d'origine, relevé dans le journal des écrans de la borne de référence (19/11/2026) : Pinball
// FX3 en plein écran exclusif 1920 × 1080 sur le playfield 4K. Windows redispose les écrans ; les
// fenêtres du front-end, restées à leurs coordonnées, tombent sur l'écran voisin (le plateau tourné
// sur l'écran du DMD, la carte du DMD sur le fronton).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followDisplays, gameScreens, misplacedWindows, surfaceRoleRects, type RoleDisplays } from '../gamescreens';
import { occupiedRoles, type RoleRect } from '../menumoments';
import type { ObservedDisplay, RoleId } from '../model';
import type { StackedWindow } from '../screencover';
import { sameDisplay, screenSurfaces } from '../zones';
import { frontendSource } from './frontend-source';

function display(id: string, x: number, y: number, width: number, height: number, primary = false): ObservedDisplay {
  return { gdiName: `\\\\.\\DISPLAY${id}`, friendlyName: `Écran ${id}`, devicePath: `\\\\?\\DISPLAY#TEST${id}#1&2&0&UID${id}#{e6f07b5f}`, bounds: { x, y, width, height }, rotation: 0, primary };
}

// Avant la partie : playfield 4K, DMD (FullDMD) et fronton à sa droite, décalés en hauteur.
const BEFORE: RoleDisplays = {
  playfield: display('1', 0, 0, 3840, 2160, true),
  dmd: display('2', 3840, 90, 1920, 1080),
  backglass: display('3', 5760, 101, 1920, 1080),
};
// Pinball FX3 passe le playfield en 1920 × 1080 : les deux autres glissent vers la gauche.
const DURING: ObservedDisplay[] = [display('1', 0, 0, 1920, 1080, true), display('2', 1920, 90, 1920, 1080), display('3', 3840, 101, 1920, 1080)];

test('écran changé par un jeu : chaque rôle garde son écran physique, à sa nouvelle place', () => {
  const { assignments, moved } = followDisplays(BEFORE, DURING);
  assert.deepEqual(assignments.playfield!.bounds, { x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(assignments.dmd!.bounds, { x: 1920, y: 90, width: 1920, height: 1080 });
  assert.deepEqual(assignments.backglass!.bounds, { x: 3840, y: 101, width: 1920, height: 1080 });
  assert.deepEqual(moved.map((m) => m.role), ['playfield', 'backglass', 'dmd']);
  // L'invariant : jamais l'écran d'un autre rôle, même quand un autre écran prend sa place.
  for (const role of Object.keys(BEFORE) as RoleId[]) assert.ok(sameDisplay(assignments[role], BEFORE[role]), role);
  // Fin de la partie : la définition revient, chaque rôle aussi.
  const back = followDisplays(assignments, Object.values(BEFORE) as ObservedDisplay[]);
  assert.deepEqual(back.assignments, BEFORE);
  // Rien n'a bougé : rien à faire.
  assert.deepEqual(followDisplays(BEFORE, Object.values(BEFORE) as ObservedDisplay[]).moved, []);
});

test('écran reconnu à son identité, pas à sa place : deux écrans qui échangent leurs coordonnées', () => {
  const swapped = [display('1', 0, 0, 3840, 2160, true), display('2', 5760, 101, 1920, 1080), display('3', 3840, 90, 1920, 1080)];
  const { assignments } = followDisplays(BEFORE, swapped);
  assert.equal(assignments.dmd!.bounds.x, 5760);
  assert.equal(assignments.backglass!.bounds.x, 3840);
});

test('écran débranché : le rôle garde son ancien écran, sa fenêtre attend son retour', () => {
  const { assignments, moved } = followDisplays(BEFORE, [display('1', 0, 0, 3840, 2160, true), display('3', 5760, 101, 1920, 1080)]);
  assert.deepEqual(assignments.dmd, BEFORE.dmd);
  assert.deepEqual(moved, []);
  // Windows l'a chassée sur le playfield : pas comptée, son écran n'est pas là.
  assert.deepEqual(misplacedWindows(assignments, { dmd: { x: 0, y: 0, width: 1920, height: 1080 } }, [display('1', 0, 0, 3840, 2160, true)]), []);
});

test('fenêtre sur l’écran d’un autre rôle : repérée, avec l’écran où elle est', () => {
  const { assignments } = followDisplays(BEFORE, DURING);
  // Où étaient les fenêtres sur la borne : le plateau sur l'écran du DMD, le DMD sur le fronton, le fronton hors de tout écran.
  const windows = { playfield: { x: 1920, y: 90, width: 1920, height: 1080 }, dmd: { x: 3840, y: 90, width: 1920, height: 1080 }, backglass: { x: 5760, y: 101, width: 1920, height: 1080 } };
  const found = misplacedWindows(assignments, windows, DURING);
  assert.deepEqual(
    found.map((m) => [m.role, m.on?.gdiName]),
    [
      ['playfield', '\\\\.\\DISPLAY2'],
      ['backglass', undefined],
      ['dmd', '\\\\.\\DISPLAY3'],
    ],
  );
  // Reposées sur leur écran : plus rien.
  const placed = Object.fromEntries((Object.keys(assignments) as RoleId[]).map((r) => [r, { ...assignments[r]!.bounds }]));
  assert.deepEqual(misplacedWindows(assignments, placed, DURING), []);
});

test('zones des rôles recalculées sur les nouveaux écrans', () => {
  const { assignments } = followDisplays(BEFORE, DURING);
  const rects = surfaceRoleRects(screenSurfaces(assignments, { dmd: { x: 0, y: 0.75, width: 1, height: 0.25 } }));
  assert.deepEqual(rects.find((r) => r.role === 'playfield')!.rect, { x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(rects.find((r) => r.role === 'dmd')!.rect, { x: 1920, y: 90 + 810, width: 1920, height: 270 });
});

function win(pid: number, x: number, y: number, width: number, height: number, extra: Partial<StackedWindow> = {}): StackedWindow {
  return { pid, className: 'Window', title: '', rect: { x, y, width, height }, minimized: false, ...extra };
}

const ME = 15592;
const FX3 = 3980;
const SHELL = 14884;
const zonesDuring: RoleRect[] = DURING.map((d, i) => ({ role: (['playfield', 'dmd', 'backglass'] as const)[i]!, rect: { ...d.bounds } }));

test('partie de Zen : seules les fenêtres du jeu occupent un écran, jamais celles du shell de Windows', () => {
  // La pile relevée sur la borne : « Expérience d’entrée Windows » (shell, plein écran 4K en 0, 0, premier plan
  // permanent) au-dessus de tout, puis Pinball FX3 sur le playfield, puis les fenêtres du front-end.
  const stack = [
    win(SHELL, 0, 0, 3840, 2160, { className: 'Windows.UI.Core.CoreWindow', title: 'Expérience d’entrée Windows', topmost: true }),
    win(FX3, 0, 0, 1920, 1080, { className: 'D3DProxyWindow', title: 'D3DProxyWindow', topmost: true }),
    win(FX3, 0, 0, 1920, 1080, { className: 'PxWindowClass', title: 'Pinball FX Classic', topmost: true }),
    win(ME, 1920, 90, 1920, 1080, { title: 'Cyber Pinball — FullDMD' }),
    win(ME, 3840, 101, 1920, 1080, { title: 'Cyber Pinball — Backglass' }),
    win(ME, 0, 0, 1920, 1080, { title: 'Cyber Pinball — Playfield' }),
  ];
  assert.deepEqual(gameScreens(zonesDuring, stack, ME, [FX3]), { occupied: ['playfield'], hidden: [] });
  // La règle de VPX (toute fenêtre d'un autre processus) aurait pris le DMD pour occupé, à cause du shell.
  assert.ok(occupiedRoles(zonesDuring, stack, ME).includes('dmd'));
  // Jeu pas encore reconnu : rien n'est occupé.
  assert.deepEqual(gameScreens(zonesDuring, stack, ME, []).occupied, []);
});

test('mode borne d’un jeu : sa fenêtre de fronton cachée par le front-end est à repasser devant', () => {
  const backglassGame = win(FX3, 3840, 101, 1920, 1080, { title: 'Backglass' });
  const ours = win(ME, 3840, 101, 1920, 1080, { title: 'Cyber Pinball — Backglass' });
  const veil = win(ME, 3840, 101, 1920, 1080, { title: 'Cyber Pinball — Fond' });
  const stack = [win(FX3, 0, 0, 1920, 1080), ours, veil, backglassGame];
  const { occupied, hidden } = gameScreens(zonesDuring, stack, ME, [FX3]);
  assert.deepEqual(occupied, ['playfield', 'backglass']);
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0]!.role, 'backglass');
  assert.equal(hidden[0]!.game, backglassGame);
  // De la plus basse à la plus haute : le voile reste sous la fenêtre du fronton.
  assert.deepEqual(hidden[0]!.ours, [veil, ours]);
  // Devant le front-end, ou réduite : rien à faire.
  assert.deepEqual(gameScreens(zonesDuring, [backglassGame, ours], ME, [FX3]).hidden, []);
  assert.deepEqual(gameScreens(zonesDuring, [ours, { ...backglassGame, minimized: true }], ME, [FX3]).occupied, []);
});

test('branchement : les écrans changés reposent les fenêtres, et les jeux autres que VPX ont leur relevé', () => {
  const frontend = frontendSource();
  // Écrans qui ont fini de changer : les fenêtres suivent leur écran avant toute reprise.
  assert.match(frontend, /onScreensSettled\(\(\) => \{\s*followMenuScreens\(\);\s*return playing \|\| launch \|\| recoverScreens\('displays'\);/);
  // Partie de Zen ou de Future Pinball : relevé des écrans par les fenêtres du processus du jeu.
  const zen = frontend.slice(frontend.indexOf('async function playPinballFx('), frontend.indexOf('async function play(table'));
  assert.match(zen, /watchOccupied\([^;]*\{ name: zenName, pids: \(\) => \(game\.pid === undefined \? \[\] : \[game\.pid\]\) \}/);
  assert.match(zen, /stopWatchOccupied\(\)/);
  // VPX : le relevé de toujours (toute fenêtre d'un autre processus), sans jeu désigné.
  assert.match(frontend, /watchOccupied\(simulated\?\.split\(','\)\.filter\(\(r\): r is RoleId => ROLES\.some\(\(x\) => x\.id === r\)\)\);/);
});
