import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import { currentFlipperEdge, diagonalInches, edgeAfterRotation, edidSize, isCabinetView, playerView, playfieldRotation, playfieldSize, readingScreen, rotatedDisplay, sizeFromDiagonal } from '../layout';
import { edgeRotation, type FlipperEdge } from '../model';
import { vpxFlipperEdge, vpxOrientationFix } from '../vpx';
import { devPcDisplays, display, emptyCabinet } from './fixtures';

const iiyama = () => devPcDisplays()[3]!;

test('rotation à appliquer selon le bord des flippers', () => {
  assert.deepEqual(
    (['bottom', 'left', 'top', 'right'] as const).map(edgeRotation),
    [0, 90, 180, 270],
  );
  assert.equal(playfieldRotation(undefined, iiyama()), 0);
  assert.equal(playfieldRotation({ ...emptyCabinet(), playfield: { flipperEdge: 'right' } }, undefined), 270);
});

test('vue borne quand le joueur se tient sur un côté d’un écran paysage', () => {
  assert.deepEqual(playerView(iiyama(), 'left'), { width: 1080, height: 1920 });
  assert.equal(isCabinetView(iiyama(), 'bottom'), false);
  assert.equal(isCabinetView(iiyama(), 'left'), true);
  assert.equal(isCabinetView(iiyama(), 'right'), true);
  // Windows déjà passé en portrait : le joueur est en bas de l'image.
  const portrait = display('\\\\.\\DISPLAY2', 'TV', { x: 0, y: 0, width: 1080, height: 1920 }, undefined, 'x');
  assert.equal(isCabinetView(portrait, 'bottom'), true);
});

test('taille EDID retenue si elle colle aux proportions de l’image', () => {
  assert.deepEqual(edidSize(iiyama().edid, iiyama()), { width: 48, height: 26 });
  // Le côté le plus long est toujours la largeur, même si Windows est en portrait.
  const portrait = { ...iiyama(), bounds: { x: 0, y: 0, width: 1080, height: 1920 } };
  assert.deepEqual(edidSize(iiyama().edid, portrait), { width: 48, height: 26 });
});

test('taille EDID refusée : absente, mal proportionnée ou fantaisiste', () => {
  const d = iiyama();
  assert.equal(edidSize(undefined, d), undefined);
  assert.equal(edidSize({ ...d.edid!, widthCm: 0, heightCm: 0 }, d), undefined);
  assert.equal(edidSize({ ...d.edid!, widthCm: 16, heightCm: 9 }, d), undefined, 'moins de 10 pouces');
  assert.equal(edidSize({ ...d.edid!, widthCm: 40, heightCm: 30 }, d), undefined, '4/3 sur une image 16/9');
});

test('taille depuis la diagonale, aux proportions de la définition', () => {
  const size = sizeFromDiagonal(43, iiyama());
  assert.deepEqual(size, { width: 95.19, height: 53.55 });
  assert.equal(Math.round(diagonalInches(size)), 43);
});

test('la taille saisie prime sur l’EDID', () => {
  const cabinet = emptyCabinet();
  assert.deepEqual(playfieldSize(cabinet, iiyama()), { width: 48, height: 26 });
  cabinet.playfield = { flipperEdge: 'left', manualSizeCm: { width: 53.55, height: 95.2 } };
  assert.deepEqual(playfieldSize(cabinet, iiyama()), { width: 95.2, height: 53.55 });
});

test('la taille au millimètre de l’EDID prime sur les centimètres entiers', () => {
  const d = iiyama();
  assert.deepEqual(edidSize({ ...d.edid!, imageMm: { width: 477, height: 268 } }, d), { width: 47.7, height: 26.8 });
  // Timing incohérent : on retombe sur les centimètres.
  assert.deepEqual(edidSize({ ...d.edid!, imageMm: { width: 160, height: 90 } }, d), { width: 48, height: 26 });
});

const EDGES: FlipperEdge[] = ['bottom', 'left', 'top', 'right'];
const portraitIiyama = () => ({ ...iiyama(), bounds: { ...iiyama().bounds, width: 1080, height: 1920 }, rotation: 90 as const });

test('bord du joueur après un retournement de l’écran dans Windows', () => {
  assert.deepEqual(
    EDGES.map((e) => edgeAfterRotation(e, 180)),
    ['top', 'right', 'bottom', 'left'],
  );
  assert.deepEqual(EDGES.map((e) => edgeAfterRotation(e, 0)), EDGES);
  // Un quart de tour, puis un autre : comme un retournement.
  for (const e of EDGES) assert.equal(edgeAfterRotation(edgeAfterRotation(e, 90), 90), edgeAfterRotation(e, 180));
  for (const e of EDGES) assert.equal(edgeAfterRotation(edgeAfterRotation(e, 90), 270), e);
});

test('écran tourné : définition échangée au quart de tour seulement', () => {
  const flipped = rotatedDisplay(iiyama(), 180);
  assert.equal(flipped.rotation, 180);
  assert.deepEqual(flipped.bounds, iiyama().bounds);
  const portrait = rotatedDisplay(iiyama(), 90);
  assert.equal(portrait.rotation, 90);
  assert.deepEqual(portrait.bounds, { x: 1920, y: 0, width: 1080, height: 1920 });
  assert.equal(rotatedDisplay(flipped, 270).rotation, 90);
  // L'original n'est pas modifié.
  assert.equal(iiyama().rotation, 0);
});

test('rien à tourner quand VPX place déjà les flippers du côté du joueur', () => {
  assert.equal(vpxOrientationFix(iiyama(), 'right'), undefined);
  assert.equal(vpxOrientationFix(iiyama(), 'bottom'), undefined);
  assert.equal(vpxOrientationFix(portraitIiyama(), 'bottom'), undefined);
});

test('joueur à gauche d’une image paysage, ou en haut : on retourne l’écran', () => {
  assert.deepEqual(vpxOrientationFix(iiyama(), 'left'), { delta: 180, rotation: 180, edge: 'right' });
  assert.deepEqual(vpxOrientationFix(iiyama(), 'top'), { delta: 180, rotation: 180, edge: 'bottom' });
  // Windows déjà en portrait, joueur en haut : retour au portrait d'origine.
  assert.deepEqual(vpxOrientationFix({ ...portraitIiyama(), rotation: 270 }, 'top'), { delta: 180, rotation: 90, edge: 'bottom' });
});

test('Windows en portrait vu de côté : un quart de tour remet l’image en paysage', () => {
  assert.deepEqual(vpxOrientationFix(portraitIiyama(), 'left'), { delta: 270, rotation: 0, edge: 'bottom' });
  assert.deepEqual(vpxOrientationFix(portraitIiyama(), 'right'), { delta: 90, rotation: 180, edge: 'bottom' });
});

test('après la correction proposée, VPX et le joueur sont toujours d’accord', () => {
  for (const d of [iiyama(), portraitIiyama()]) {
    for (const edge of EDGES) {
      const fix = vpxOrientationFix(d, edge);
      const after = fix ? rotatedDisplay(d, fix.delta) : d;
      const playerEdge = fix ? fix.edge : edge;
      assert.equal(vpxFlipperEdge(after, playerEdge), playerEdge, `${d.bounds.width}×${d.bounds.height}, flippers ${edge}`);
      // Le joueur ne voit pas la différence : l'affichage reste droit pour lui.
      if (fix) assert.equal((edgeRotation(fix.edge) - edgeRotation(edge) - fix.delta + 720) % 360, 0);
    }
  }
});

/** Modèle enregistré avec l'iiyama en playfield, joueur au bord `edge`, Windows en paysage. */
function cabinetWithPlayfield(edge: FlipperEdge) {
  const screen = toPhysicalScreen(iiyama());
  return { ...emptyCabinet(), screens: [screen], roles: { playfield: screen.fingerprint }, playfield: { flipperEdge: edge } };
}

test('bord actuel : orientation inchangée depuis l’assistant, bord enregistré', () => {
  for (const edge of EDGES) assert.equal(currentFlipperEdge(cabinetWithPlayfield(edge), iiyama()), edge);
});

test('bord actuel : écran retourné hors de l’assistant, le joueur change de bord', () => {
  const flipped = rotatedDisplay(iiyama(), 180);
  assert.deepEqual(
    EDGES.map((e) => currentFlipperEdge(cabinetWithPlayfield(e), flipped)),
    ['top', 'right', 'bottom', 'left'],
  );
});

test('bord actuel : quart de tour hors de l’assistant, dans un sens ou dans l’autre', () => {
  assert.equal(currentFlipperEdge(cabinetWithPlayfield('right'), rotatedDisplay(iiyama(), 90)), 'bottom');
  assert.equal(currentFlipperEdge(cabinetWithPlayfield('right'), rotatedDisplay(iiyama(), 270)), 'top');
  // Enregistré en portrait, revenu en paysage : l'écart compte, pas l'orientation seule.
  const portrait = cabinetWithPlayfield('bottom');
  portrait.screens[0]!.lastSeen = portraitIiyama();
  assert.equal(currentFlipperEdge(portrait, iiyama()), 'right');
  assert.equal(currentFlipperEdge(portrait, portraitIiyama()), 'bottom');
});

test('bord actuel : sans orientation relevée à l’enregistrement, bord enregistré', () => {
  const cabinet = cabinetWithPlayfield('left');
  delete cabinet.screens[0]!.lastSeen;
  assert.equal(currentFlipperEdge(cabinet, rotatedDisplay(iiyama(), 180)), 'left');
  assert.equal(currentFlipperEdge(emptyCabinet(), iiyama()), undefined);
});

test('fenêtres du playfield : la rotation suit l’orientation actuelle de l’écran', () => {
  const cabinet = cabinetWithPlayfield('right');
  assert.equal(playfieldRotation(cabinet, iiyama()), 270);
  // Retourné hors de l'assistant : joueur à gauche de la nouvelle image.
  assert.equal(playfieldRotation(cabinet, rotatedDisplay(iiyama(), 180)), 90);
  assert.equal(playfieldRotation(cabinet, rotatedDisplay(iiyama(), 90)), 0);
});

test('écran de lecture à la souris : le playfield droit, sinon le fronton', () => {
  const playfield = { x: 0, y: 0, width: 1920, height: 1080 };
  const backglass = { x: 1920, y: 0, width: 1920, height: 1080 };
  const dmd = { x: 3840, y: 0, width: 1280, height: 390 };
  const screens = [
    { role: 'dmd', bounds: dmd },
    { role: 'playfield', bounds: playfield },
    { role: 'backglass', bounds: backglass },
  ];
  // Bureau, ou playfield que Windows montre dans le sens du joueur : on y reste.
  assert.equal(readingScreen(screens, 0), playfield);
  // Playfield couché et tourné (flippers à gauche ou à droite de l'image) : le fronton.
  assert.equal(readingScreen(screens, 270), backglass);
  assert.equal(readingScreen(screens, 90), backglass);
  assert.equal(readingScreen(screens, 180), backglass);
  // À taille égale, le fronton plutôt que le topper ; seul écran : le playfield, même tourné.
  assert.equal(readingScreen([{ role: 'topper', bounds: dmd }, { role: 'backglass', bounds: dmd }, { role: 'playfield', bounds: playfield }], 270), dmd);
  assert.equal(readingScreen([{ role: 'topper', bounds: { ...dmd } }, { role: 'backglass', bounds: dmd }], 270), dmd);
  assert.equal(readingScreen([{ role: 'playfield', bounds: playfield }], 270), playfield);
  assert.equal(readingScreen([], 270), undefined);
});
