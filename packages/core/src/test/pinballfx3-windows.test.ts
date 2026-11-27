// Pinball FX3 en mode borne : placement de ses fenêtres du DMD et du fronton (pinballfx3-windows.ts).
// Les places de départ sont celles relevées sur le PinCab le 27/11/2026.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Rect } from '../model';
import { classifyFx3Windows, createFx3PlacementWatch, FX3_MAX_ATTEMPTS, fx3WindowTarget, type Fx3PlacementEvents, type Fx3Window, type Fx3WindowRole } from '../pinballfx3-windows';

const win = (handle: number, title: string, rect: Rect): Fx3Window => ({ handle: BigInt(handle), title, visible: true, rect });

// Relevé : playfield 3856 x 2180, DMD 1920 x 480 en (3840, 390), fronton 1920 x 1080 en (5760, 101).
const playfield = (): Fx3Window => win(1, 'Pinball FX Classic', { x: 0, y: 0, width: 3856, height: 2180 });
const dmd = (): Fx3Window => win(2, 'Pinball FX2', { x: 3840, y: 390, width: 1920, height: 480 });
const backglass = (): Fx3Window => win(3, 'Pinball FX2', { x: 5760, y: 101, width: 1920, height: 1080 });

const DMD_SCREEN: Rect = { x: 3840, y: 0, width: 1920, height: 1080 };
const BACKGLASS_SCREEN: Rect = { x: 5760, y: 0, width: 1920, height: 1080 };
const roles = (role: Fx3WindowRole): Rect => (role === 'dmd' ? DMD_SCREEN : BACKGLASS_SCREEN);

function harness() {
  const moves: { handle: bigint; to: Rect }[] = [];
  const placed: string[] = [];
  const resisted: string[] = [];
  const events: Fx3PlacementEvents = {
    placed: (role, to) => placed.push(`${role} ${to.x},${to.y} ${to.width}x${to.height}`),
    resisted: (role, wanted, actual) => resisted.push(`${role} voulu ${wanted.x},${wanted.y} relevé ${actual.x},${actual.y}`),
  };
  const setBounds = (w: Fx3Window, to: Rect): boolean => {
    moves.push({ handle: w.handle, to });
    return true;
  };
  return { moves, placed, resisted, events, setBounds };
}

test('reconnaissance : le playfield est laissé, le DMD (4 : 1) et le fronton (16 : 9) se distinguent par leur forme', () => {
  const found = classifyFx3Windows([playfield(), backglass(), dmd()]);
  assert.equal(found.dmd?.handle, 2n);
  assert.equal(found.backglass?.handle, 3n);
  // Hors du mode borne : le seul playfield, rien à placer.
  assert.deepEqual(classifyFx3Windows([playfield()]), {});
  // Une fenêtre invisible, réduite ou de taille nulle ne compte pas.
  assert.deepEqual(classifyFx3Windows([{ ...dmd(), visible: false }, { ...backglass(), minimized: true }, win(4, 'Pinball FX2', { x: 0, y: 0, width: 0, height: 0 })]), {});
});

test('place voulue : la forme gardée, la plus grande possible dans l’écran du rôle, centrée', () => {
  // DMD du PinCab : toute la largeur, centré en hauteur (et plus à 390).
  assert.deepEqual(fx3WindowTarget(dmd().rect, DMD_SCREEN), { x: 3840, y: 300, width: 1920, height: 480 });
  // Fronton : tout l'écran, plus à 101 px du haut.
  assert.deepEqual(fx3WindowTarget(backglass().rect, BACKGLASS_SCREEN), BACKGLASS_SCREEN);
  // Zone plus petite que l'écran (DMD de la configuration) : la fenêtre y entre, dans sa forme.
  const zone: Rect = { x: 3900, y: 100, width: 960, height: 400 };
  assert.deepEqual(fx3WindowTarget(dmd().rect, zone), { x: 3900, y: 180, width: 960, height: 240 });
  assert.equal(fx3WindowTarget(dmd().rect, { x: 0, y: 0, width: 0, height: 0 }), undefined);
});

test('pose : DMD et fronton déplacés sur leurs écrans, confirmés une fois relus, jamais touchés ensuite', () => {
  const h = harness();
  const watch = createFx3PlacementWatch();
  const state = [playfield(), dmd(), backglass()];
  watch.tick(state, roles, h.setBounds, h.events);
  assert.deepEqual(h.moves.map((m) => [m.handle, m.to]), [
    [3n, BACKGLASS_SCREEN],
    [2n, { x: 3840, y: 300, width: 1920, height: 480 }],
  ]);
  assert.deepEqual(h.placed, []); // pas encore relu
  // Passage suivant : Windows relit les nouvelles places.
  const moved = [playfield(), { ...dmd(), rect: h.moves[1]!.to }, { ...backglass(), rect: h.moves[0]!.to }];
  watch.tick(moved, roles, h.setBounds, h.events);
  assert.deepEqual(h.placed, ['backglass 5760,0 1920x1080', 'dmd 3840,300 1920x480']);
  watch.tick(moved, roles, h.setBounds, h.events);
  watch.tick(moved, roles, h.setBounds, h.events);
  assert.equal(h.moves.length, 2, 'aucune nouvelle pose');
  assert.equal(h.placed.length, 2, 'confirmé une seule fois');
  assert.deepEqual(h.resisted, []);
});

test('garde-fou : un jeu qui remet la fenêtre ailleurs est reposé FX3_MAX_ATTEMPTS fois, puis signalé une fois et laissé', () => {
  const h = harness();
  const watch = createFx3PlacementWatch();
  // Le jeu replace toujours son DMD en (3840, 390) : la fenêtre relue n'est jamais à la place voulue.
  for (let i = 0; i < FX3_MAX_ATTEMPTS + 6; i++) watch.tick([playfield(), dmd()], roles, h.setBounds, h.events);
  assert.equal(h.moves.length, FX3_MAX_ATTEMPTS);
  assert.deepEqual(h.resisted, ['dmd voulu 3840,300 relevé 3840,390']);
  assert.deepEqual(h.placed, []);
});

test('sans écran pour le rôle, ou déjà à la place voulue, ou hors du mode borne : rien n’est touché', () => {
  const h = harness();
  const watch = createFx3PlacementWatch();
  watch.tick([playfield(), dmd(), backglass()], () => undefined, h.setBounds, h.events);
  watch.tick([playfield()], roles, h.setBounds, h.events);
  const right = [playfield(), { ...dmd(), rect: fx3WindowTarget(dmd().rect, DMD_SCREEN)! }, { ...backglass(), rect: BACKGLASS_SCREEN }];
  watch.tick(right, roles, h.setBounds, h.events);
  assert.deepEqual(h.moves, []);
  assert.deepEqual(h.resisted, []);
});

test('le jeu qui déplace une fenêtre déjà confirmée la fait reposer', () => {
  const h = harness();
  const watch = createFx3PlacementWatch();
  watch.tick([playfield(), backglass()], roles, h.setBounds, h.events);
  watch.tick([playfield(), { ...backglass(), rect: BACKGLASS_SCREEN }], roles, h.setBounds, h.events);
  assert.equal(h.placed.length, 1);
  // Écran rebranché : le jeu remet son fronton en (5760, 101).
  watch.tick([playfield(), backglass()], roles, h.setBounds, h.events);
  assert.equal(h.moves.length, 2);
});
