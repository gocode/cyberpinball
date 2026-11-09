// Le menu dans le casque (casque.ts) : une borne vue du joueur, chaque écran à sa taille réelle,
// le playfield couché, incliné, le bord des flippers vers le joueur ; la tête de la borne debout.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headsetPanels, headsetProtocol, LOCKBAR_DISTANCE_M, panelSize, rotateVector, type HeadsetPanel, type HeadsetSource } from '../casque';
import { edgeRotation } from '../model';

const close = (a: number, b: number, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// Borne type : playfield 43" 4K couché, Windows en paysage, flippers au bord gauche de l'image ;
// fronton 32", DMD 15,6".
const sources: HeadsetSource[] = [
  { role: 'playfield', rect: { x: 0, y: 0, width: 3840, height: 2160 }, screenCm: { width: 95, height: 53.5 }, screenPx: { width: 3840, height: 2160 } },
  { role: 'backglass', rect: { x: 3840, y: 0, width: 1920, height: 1080 }, screenCm: { width: 70, height: 39.4 }, screenPx: { width: 1920, height: 1080 } },
  { role: 'dmd', rect: { x: 5760, y: 0, width: 1920, height: 1080 }, screenCm: { width: 34.5, height: 19.4 }, screenPx: { width: 1920, height: 1080 } },
];

/** Direction, dans l'espace de la borne, d'un axe de l'image du panneau (x à droite, y en haut). */
const imageAxis = (p: HeadsetPanel, v: { x: number; y: number; z: number }) => rotateVector(p.orientation, v);

test('chaque panneau a la taille réelle de son écran, ou une largeur par défaut sans EDID', () => {
  const pf = panelSize(sources[0]!);
  close(pf.width, 0.95);
  close(pf.height, 0.535);
  // Zone d'un écran : la part de ses centimètres.
  const half = panelSize({ ...sources[1]!, rect: { x: 3840, y: 540, width: 1920, height: 540 } });
  close(half.width, 0.7);
  close(half.height, 0.197);
  const unknown = panelSize({ role: 'topper', rect: { x: 0, y: 0, width: 1920, height: 480 } });
  close(unknown.width, 0.6);
  close(unknown.height, 0.15);
});

test('le playfield est couché devant le joueur, incliné, le bord des flippers vers lui', () => {
  const panels = headsetPanels(sources, edgeRotation('left'));
  const pf = panels.find((p) => p.role === 'playfield')!;
  // Face vers le haut (légèrement vers le joueur, pente de 6,5°).
  const normal = imageAxis(pf, { x: 0, y: 0, z: 1 });
  assert.ok(normal.y > 0.99 && normal.z > 0.1, JSON.stringify(normal));
  // Bord gauche de l'image (les flippers) : vers le joueur (+z), bord droit vers le fond.
  const left = imageAxis(pf, { x: -1, y: 0, z: 0 });
  assert.ok(left.z > 0.99, JSON.stringify(left));
  // Image tournée d'un quart : la longueur du plateau est la largeur de l'écran, 95 cm, depuis la barre avant.
  close(pf.position.z, -LOCKBAR_DISTANCE_M - (0.95 / 2) * Math.cos((6.5 * Math.PI) / 180));
  assert.ok(pf.position.y > 0.8 && pf.position.y < 0.9);
  // Flippers en bas de l'image (PC de bureau) : le bas vers le joueur.
  const desk = headsetPanels(sources, edgeRotation('bottom')).find((p) => p.role === 'playfield')!;
  assert.ok(imageAxis(desk, { x: 0, y: -1, z: 0 }).z > 0.99);
  const right = headsetPanels(sources, edgeRotation('right')).find((p) => p.role === 'playfield')!;
  assert.ok(imageAxis(right, { x: 1, y: 0, z: 0 }).z > 0.99);
});

test('la tête de la borne est debout au bout du plateau : DMD, puis fronton au-dessus, puis topper', () => {
  const withTopper = [...sources, { role: 'topper' as const, rect: { x: 7680, y: 0, width: 1920, height: 480 } }];
  const panels = headsetPanels(withTopper, edgeRotation('left'));
  const by = (role: string) => panels.find((p) => p.role === role)!;
  const pf = by('playfield');
  for (const role of ['dmd', 'backglass', 'topper']) {
    const p = by(role);
    // Face au joueur, image droite.
    close(imageAxis(p, { x: 0, y: 0, z: 1 }).z, 1);
    close(imageAxis(p, { x: 0, y: 1, z: 0 }).y, 1);
    // Plus loin que le plateau.
    assert.ok(p.position.z < pf.position.z - 0.4, role);
  }
  const top = (p: HeadsetPanel) => p.position.y + p.height / 2;
  const bottom = (p: HeadsetPanel) => p.position.y - p.height / 2;
  assert.ok(bottom(by('backglass')) > top(by('dmd')));
  assert.ok(bottom(by('topper')) > top(by('backglass')));
  // Fronton à hauteur des yeux d'un joueur debout, ou presque.
  assert.ok(by('backglass').position.y > 1.2 && by('backglass').position.y < 1.9, String(by('backglass').position.y));
});

test('sans playfield, la tête reste en place ; le protocole du compagnon décrit chaque panneau puis « fin »', () => {
  const head = headsetPanels(sources.slice(1), 0);
  assert.deepEqual(head.map((p) => p.role), ['dmd', 'backglass']);
  const lines = headsetProtocol(headsetPanels(sources, 90));
  assert.equal(lines.length, 4);
  assert.equal(lines.at(-1), 'fin');
  const fields = lines[0]!.split(' ');
  assert.equal(fields[0], 'panneau');
  assert.equal(fields[1], 'playfield');
  assert.deepEqual(fields.slice(2, 6), ['0', '0', '3840', '2160']);
  assert.equal(fields.length, 15);
  assert.ok(fields.slice(6).every((f) => Number.isFinite(Number(f))), lines[0]);
});
