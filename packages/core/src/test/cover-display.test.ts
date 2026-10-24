import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

// Fenêtres de l'application : chacune couvre son écran, barre des tâches de Windows comprise.
// Une fenêtre sans cadre posée aux limites de l'écran par setBounds reste sous la barre des
// tâches, qui cache alors le bas de la page et ce qu'on y clique (menu, réglages, assistant).
const APP = path.join(__dirname, '..', '..', '..', '..', 'app');
const SOURCES = path.join(APP, 'src');

function appSources(): { file: string; text: string }[] {
  return fs
    .readdirSync(SOURCES)
    .filter((f) => f.endsWith('.ts'))
    .map((file) => ({ file, text: fs.readFileSync(path.join(SOURCES, file), 'utf8') }));
}

test('aucune fenêtre n’est dimensionnée à la main : setBounds n’est appelé que par coverDisplay', () => {
  const offenders = appSources()
    .filter((s) => s.file !== 'cover-display.ts')
    .flatMap((s) => s.text.split('\n').flatMap((line, i) => (/\.setBounds\(/.test(line) ? [`${s.file}:${i + 1} ${line.trim()}`] : [])));
  assert.deepEqual(offenders, [], 'utiliser coverDisplay(win, bounds) de app/src/cover-display.ts');
});

test('chaque module qui crée une fenêtre la fait couvrir son écran par coverDisplay', () => {
  // Les fenêtres naissent toutes par createWindow (offscreen.ts) : voir offscreen.test.ts.
  const creators = appSources().filter((s) => s.file !== 'offscreen.ts' && /createWindow\(/.test(s.text));
  assert.ok(creators.length >= 3, 'menu, réglages et assistant créent leurs fenêtres');
  for (const s of creators) assert.match(s.text, /coverDisplay\(/, `${s.file} crée une fenêtre sans coverDisplay`);
});

test('coverProblem : plein écran et écran couvert, ou l’écart en clair', () => {
  // Compilé avec l'application (npm test construit tout avant de lancer les tests).
  type Rect = { x: number; y: number; width: number; height: number };
  const { coverProblem } = require(path.join(APP, 'dist', 'cover-display.js')) as {
    coverProblem(state: { fullScreen: boolean; bounds: Rect }, wanted: Rect): string | undefined;
  };
  const screen = { x: 0, y: 0, width: 1920, height: 1080 };
  const rotated = { x: -1080, y: 0, width: 1080, height: 1920 };
  assert.equal(coverProblem({ fullScreen: true, bounds: screen }, screen), undefined);
  // Écran non principal, pivoté : coordonnées négatives, plus haut que large.
  assert.equal(coverProblem({ fullScreen: true, bounds: rotated }, rotated), undefined);
  // Le cas de la barre des tâches : aux limites de l'écran, mais pas en plein écran.
  assert.match(coverProblem({ fullScreen: false, bounds: screen }, screen) ?? '', /pas en plein écran/);
  // Plein écran sur le mauvais écran, ou amputé de la hauteur de la barre des tâches.
  assert.match(coverProblem({ fullScreen: true, bounds: screen }, rotated) ?? '', /1920 × 1080 en 0, 0 au lieu de 1080 × 1920 en -1080, 0/);
  assert.ok(coverProblem({ fullScreen: true, bounds: { ...screen, height: 1032 } }, screen));
});
