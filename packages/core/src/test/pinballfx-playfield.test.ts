// Pinball FX : fenêtre du jeu posée sur l'écran du playfield (app/src/pinballfx-playfield.ts).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

type Rect = { x: number; y: number; width: number; height: number };
const app = require(path.join(REPO_ROOT, 'app', 'dist', 'pinballfx-playfield.js')) as {
  pinballFxPlayfieldPlacement(window: Rect, screen: Rect): Rect | undefined;
  placePinballFxPlayfield(screen: Rect | undefined, windows: () => object[], set: (w: { title: string }, r: Rect) => boolean): Rect | undefined;
};

const win = (title: string, rect: Rect, extra: object = {}) => ({ title, className: 'UnrealWindow', visible: true, minimized: false, pid: 7548, rect, ...extra });
// Bureau simulé (CYBERPINBALL_DISPLAYS) : principal 1920 × 1080, playfield 3840 × 2160 à sa droite.
const PRIMARY = { x: 0, y: 0, width: 1920, height: 1080 };
const RIGHT = { x: 1920, y: 0, width: 3840, height: 2160 };
// Playfield à gauche du principal : positions négatives.
const LEFT = { x: -2160, y: -300, width: 2160, height: 3840 };

test('le jeu ouvert sur l’écran principal est posé sur l’écran du playfield, à sa taille', () => {
  const moved: [string, Rect][] = [];
  const set = (w: { title: string }, r: Rect) => (moved.push([w.title, r]), true);
  assert.deepEqual(app.placePinballFxPlayfield(RIGHT, () => [win('PinballFX  ', PRIMARY)], set), RIGHT);
  assert.deepEqual(app.placePinballFxPlayfield(LEFT, () => [win('PinballFX', PRIMARY)], set), LEFT, 'écran à gauche : positions négatives');
  assert.deepEqual(moved.map(([t]) => t), ['PinballFX  ', 'PinballFX']);
});

test('déjà posé (à 2 pixels près), écran playfield inconnu ou pas de fenêtre : rien ne bouge', () => {
  const moved: Rect[] = [];
  const set = (_w: { title: string }, r: Rect) => (moved.push(r), true);
  assert.equal(app.placePinballFxPlayfield(RIGHT, () => [win('PinballFX', { x: 1921, y: 0, width: 3840, height: 2159 })], set), undefined);
  assert.equal(app.placePinballFxPlayfield(undefined, () => [win('PinballFX', PRIMARY)], set), undefined);
  assert.equal(app.placePinballFxPlayfield(RIGHT, () => [], set), undefined);
  assert.equal(app.placePinballFxPlayfield(RIGHT, () => [win('PinballFX', PRIMARY, { minimized: true })], set), undefined, 'réduite : pas touchée');
  assert.deepEqual(moved, []);
});

test('seule la fenêtre du jeu bouge : ni le DMD virtuel de dmdext, ni une autre fenêtre', () => {
  const moved: string[] = [];
  const set = (w: { title: string }) => (moved.push(w.title), true);
  const windows = () => [win('Virtual DMD', { x: 5828, y: 322, width: 1788, height: 436 }, { className: 'SDL_app' }), win('Cyber Pinball — Playfield', RIGHT, { className: 'Chrome_WidgetWin_1' }), win('PinballFX  ', PRIMARY)];
  assert.deepEqual(app.placePinballFxPlayfield({ x: 0, y: 1200, width: 1920, height: 1080 }, windows, set), { x: 0, y: 1200, width: 1920, height: 1080 });
  assert.deepEqual(moved, ['PinballFX  ']);
});

test('déplacement refusé par Windows : rien n’est annoncé', () => {
  assert.equal(app.placePinballFxPlayfield(RIGHT, () => [win('PinballFX', PRIMARY)], () => false), undefined);
});

test('frontend.ts : la fenêtre du jeu est suivie pendant la partie de Pinball FX seulement, arrêtée à sa fin, déplacements bornés', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const body = src.slice(src.indexOf('async function playPinballFx('));
  const at = body.indexOf('placePinballFxPlayfield(');
  assert.ok(at > 0);
  const before = body.slice(at - 500, at);
  assert.match(before, /zenKey === 'pinballfx'/);
  assert.match(before, /!simulatedDisplays\(\)/);
  assert.match(body.slice(at, at + 200), /r\.role === 'playfield'/);
  assert.match(body.slice(at - 700, at), /playfieldMoves >= 40/);
  assert.match(body, /clearInterval\(playfieldWatch\)/);
});
