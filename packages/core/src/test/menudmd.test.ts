// DMD sur la roue (menudmd.ts) : le réglage de chaque table pour la roue (affiché ou masqué, place
// des points), enregistré par configuration puis par table, à part du réglage en partie
// (dmdplace.ts) ; l'écran de réglage aux boutons de la borne.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { DMD_PLACES_FILE, readDmdPlaces, saveDmdPlaces, withDmdPlace } from '../dmdplace';
import { liveDmdArea } from '../livedmd';
import {
  answerMenuDmdLeave,
  chooseMenuDmdFormat,
  markMenuDmdAuto,
  menuDmdBlocked,
  menuDmdDirty,
  menuDmdFormats,
  menuDmdKey,
  menuDmdPlaceFor,
  menuDmdPlaceOf,
  menuDmdSpot,
  menuDmdValue,
  MENU_DMD_FILE,
  openMenuDmdItem,
  readMenuDmdPlaces,
  saveMenuDmdPlaces,
  startMenuDmdEditor,
  withMenuDmdPlace,
  type MenuDmdEditorHost,
  type MenuDmdKeys,
} from '../menudmd';
import { zoneRect } from '../zones';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dmd-roue-'));
const SIZE = { width: 1920, height: 1080 };
/** Place automatique d'un FullDMD sans cadre : la bande 4:1 centrée. */
const AUTO = liveDmdArea(undefined, SIZE);
const KEYS: MenuDmdKeys = { previous: ['ShiftLeft'], next: ['ShiftRight'], confirm: ['Digit1'], exit: ['Escape'], up: ['ControlLeft'], down: ['ControlRight'] };
const host = (own = false): MenuDmdEditorHost => ({ size: SIZE, auto: { ...AUTO, aspect: 4 }, ownPlace: own });
const px = (zone: { x: number; y: number; width: number; height: number }) => zoneRect(zone, SIZE);

test('sans réglage, la roue montre la place automatique, points affichés', () => {
  const spot = menuDmdSpot(AUTO, undefined);
  assert.deepEqual(spot.zone, AUTO);
  assert.equal(spot.hidden, false);
  assert.equal(spot.own, false);
});

test('réglage enregistré : sa place, masqué ou non ; masqué seul garde la place automatique', () => {
  const zone = { x: 0.1, y: 0.6, width: 0.8, height: 0.2, aspect: 4 };
  assert.deepEqual(menuDmdSpot(AUTO, { zone, at: '' }), { zone, hidden: false, own: true });
  assert.deepEqual(menuDmdSpot(AUTO, { hidden: true, at: '' }), { zone: AUTO, hidden: true, own: true });
});

test('ce qui s’enregistre : rien pour l’automatique, la place seulement si elle a bougé', () => {
  assert.equal(menuDmdPlaceFor({ zone: { ...AUTO }, hidden: false }, AUTO, 'd'), undefined);
  assert.deepEqual(menuDmdPlaceFor({ zone: { ...AUTO }, hidden: true }, AUTO, 'd'), { hidden: true, at: 'd' });
  const moved = { ...AUTO, y: AUTO.y + 0.1 };
  assert.deepEqual(menuDmdPlaceFor({ zone: moved, hidden: false }, AUTO, 'd'), { zone: moved, at: 'd' });
});

test('dmd-roue.json : par configuration puis par table, entrées abîmées ignorées', () => {
  const dir = tmp();
  assert.deepEqual(readMenuDmdPlaces(dir), { version: 1, places: {} });
  let file = withMenuDmdPlace(readMenuDmdPlaces(dir), 'borne', 'TWD', { hidden: true, at: 'a' });
  file = withMenuDmdPlace(file, 'borne', 'GOT', { zone: { x: 0.05, y: 0.65, width: 0.9, height: 0.225 }, at: 'b' });
  file = withMenuDmdPlace(file, 'bureau', 'TWD', { zone: { x: 0, y: 0, width: 1, height: 0.25 }, at: 'c' });
  saveMenuDmdPlaces(dir, file);
  const read = readMenuDmdPlaces(dir);
  assert.equal(menuDmdPlaceOf(read, 'borne', 'TWD')?.hidden, true);
  assert.equal(menuDmdPlaceOf(read, 'bureau', 'TWD')?.hidden, undefined);
  assert.equal(menuDmdPlaceOf(read, 'borne', 'GOT')?.zone?.y, 0.65);
  assert.equal(menuDmdPlaceOf(read, 'autre', 'GOT'), undefined);
  assert.equal(menuDmdPlaceOf(read, undefined, 'GOT'), undefined);
  // Retirer la dernière table d'une configuration retire la configuration.
  assert.deepEqual(Object.keys(withMenuDmdPlace(read, 'bureau', 'TWD', undefined).places), ['borne']);
  // Une zone hors de l'écran, illisible, ou une entrée sans rien n'est pas reprise.
  fs.writeFileSync(
    path.join(dir, MENU_DMD_FILE),
    JSON.stringify({ version: 1, places: { borne: { A: { zone: { x: 0.5, y: 0, width: 0.8, height: 0.2 }, at: '' }, B: { zone: 'x' }, C: {}, D: { zone: { x: 0, y: 0, width: 1, height: 0.2 }, at: '' } } } }),
  );
  assert.deepEqual(Object.keys(readMenuDmdPlaces(dir).places.borne ?? {}), ['D']);
  fs.writeFileSync(path.join(dir, MENU_DMD_FILE), '{ pas du json');
  assert.deepEqual(readMenuDmdPlaces(dir), { version: 1, places: {} });
});

test('la roue et la partie ont chacune leur réglage : l’un ne touche jamais l’autre', () => {
  const dir = tmp();
  const game = withDmdPlace(readDmdPlaces(dir), 'borne', 'TWD', { screen: 'ecran-dmd', zone: { x: 0.1, y: 0.7, width: 0.8, height: 0.2 }, at: 'p' });
  saveDmdPlaces(dir, game);
  const before = fs.readFileSync(path.join(dir, DMD_PLACES_FILE), 'utf8');
  saveMenuDmdPlaces(dir, withMenuDmdPlace(readMenuDmdPlaces(dir), 'borne', 'TWD', { hidden: true, at: 'r' }));
  assert.equal(fs.readFileSync(path.join(dir, DMD_PLACES_FILE), 'utf8'), before, 'positions-dmd.json inchangé');
  // La place réglée en partie ne déplace pas les points de la roue, et l'inverse.
  assert.deepEqual(menuDmdSpot(AUTO, menuDmdPlaceOf(readMenuDmdPlaces(dir), 'borne', 'GOT')).zone, AUTO);
  saveDmdPlaces(dir, withDmdPlace(readDmdPlaces(dir), 'borne', 'TWD', undefined));
  assert.equal(menuDmdPlaceOf(readMenuDmdPlaces(dir), 'borne', 'TWD')?.hidden, true, 'le masquage de la roue reste');
});

test('écran de réglage : déplacer aux flippers et aux MagnaSave, au pixel, plus vite tenu, Exit annule', () => {
  const h = host(true);
  // Une place loin des bords (la bande automatique touche les deux côtés).
  const s = startMenuDmdEditor({ zone: { x: 0.25, y: 0.6, width: 0.5, height: 0.125 * (16 / 9) / 1, aspect: 4 }, hidden: false });
  const start = px(s.spot.zone);
  assert.equal(openMenuDmdItem(h, s, 'moveX'), 'handled');
  assert.equal(s.mode, 'adjust');
  for (let i = 0; i < 3; i++) menuDmdKey(h, s, KEYS, { code: 'ShiftLeft' });
  assert.equal(px(s.spot.zone).x, start.x - 3);
  menuDmdKey(h, s, KEYS, { code: 'ControlRight' });
  assert.equal(px(s.spot.zone).y, start.y + 1);
  // Tenu : le pas grandit.
  const held = px(s.spot.zone).x;
  for (let i = 0; i < 10; i++) menuDmdKey(h, s, KEYS, { code: 'ShiftRight', isAutoRepeat: true });
  assert.ok(px(s.spot.zone).x - held > 10, 'accélère');
  assert.ok(menuDmdDirty(s));
  // Exit : la ligne revient à son ouverture.
  menuDmdKey(h, s, KEYS, { code: 'Escape' });
  assert.equal(s.mode, undefined);
  assert.deepEqual(px(s.spot.zone), start);
  // Ligne fermée : les boutons reviennent à l'écran (choisir une ligne).
  assert.equal(menuDmdKey(h, s, KEYS, { code: 'ShiftRight' }), 'unhandled');
});

test('écran de réglage : le relâchement du Start qui ouvre la ligne ne la valide pas (panne du 12/11/2026)', () => {
  const h = host(true);
  const s = startMenuDmdEditor({ zone: { x: 0.25, y: 0.6, width: 0.5, height: 0.2, aspect: 4 }, hidden: false });
  const start = px(s.spot.zone);
  for (const id of ['moveX', 'moveY', 'size', 'format'] as const) {
    openMenuDmdItem(h, s, id);
    // Start relâché juste après l'ouverture : la ligne reste ouverte.
    assert.equal(menuDmdKey(h, s, KEYS, { code: 'Digit1', type: 'keyUp' }), 'handled');
    assert.equal(s.item, id, `${id} reste ouverte`);
    assert.ok(s.mode, `${id} en réglage`);
    // Un flipper relâché ne fait pas de pas de plus, un Exit relâché n'annule rien.
    menuDmdKey(h, s, KEYS, { code: 'ShiftLeft', type: 'keyUp' });
    menuDmdKey(h, s, KEYS, { code: 'Escape', type: 'keyUp' });
    assert.equal(s.item, id);
    menuDmdKey(h, s, KEYS, { code: 'Escape', type: 'keyDown' });
    assert.equal(s.mode, undefined, 'Exit appuyé ferme la ligne');
  }
  assert.deepEqual(px(s.spot.zone), start);
  // Un pas par appui de flipper, pas un de plus au relâchement.
  openMenuDmdItem(h, s, 'moveX');
  menuDmdKey(h, s, KEYS, { code: 'ShiftRight', type: 'keyDown' });
  menuDmdKey(h, s, KEYS, { code: 'ShiftRight', type: 'keyUp' });
  assert.equal(px(s.spot.zone).x, start.x + 1);
  // Ligne fermée : le relâchement revient à l'écran.
  menuDmdKey(h, s, KEYS, { code: 'Digit1', type: 'keyDown' });
  assert.equal(menuDmdKey(h, s, KEYS, { code: 'Digit1', type: 'keyUp' }), 'unhandled');
});

test('menu : les touches propres à un écran ne reçoivent les relâchements que sur demande (keysUp)', () => {
  const APP = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
  const library = fs.readFileSync(path.join(APP, 'library.ts'), 'utf8');
  const keyUp = library.slice(library.indexOf('function handleKeyUp('), library.indexOf('function readingState('));
  assert.ok(keyUp.length > 0, 'handleKeyUp trouvé');
  // Tout appel des touches de l'écran au relâchement passe par keysUp.
  const calls = keyUp.match(/\.keys\?\.\(input\)/g) ?? [];
  assert.ok(calls.length >= 1);
  assert.equal((keyUp.match(/built\.keysUp && built\.keys\?\.\(input\)/g) ?? []).length, calls.length, 'relâchement transmis sans keysUp');
  // Les écrans qui le demandent savent lire un relâchement (input.type).
  for (const f of fs.readdirSync(APP).filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(APP, f), 'utf8');
    if (/keysUp: true/.test(src)) assert.match(src, /input\.type/, `${f} demande les relâchements sans les distinguer`);
  }
});

test('écran de réglage : la taille garde le format 4:1, le format se choisit, Start valide', () => {
  const h = host();
  const s = startMenuDmdEditor(menuDmdSpot(h.auto, undefined));
  openMenuDmdItem(h, s, 'size');
  menuDmdKey(h, s, KEYS, { code: 'ShiftLeft' });
  const r = px(s.spot.zone);
  assert.ok(Math.abs(r.width / r.height - 4) < 0.05, `${r.width} × ${r.height}`);
  menuDmdKey(h, s, KEYS, { code: 'Digit1' });
  assert.equal(s.mode, undefined);
  assert.ok(menuDmdDirty(s));
  openMenuDmdItem(h, s, 'format');
  assert.equal(s.mode, 'choice');
  assert.match(menuDmdFormats()[s.choice]!, /^4:1/);
  menuDmdKey(h, s, KEYS, { code: 'ShiftRight' });
  assert.equal(menuDmdValue(h, s, 'format'), '3:1');
  chooseMenuDmdFormat(h, s, 2);
  assert.equal(menuDmdValue(h, s, 'format'), '2:1');
  menuDmdKey(h, s, KEYS, { code: 'Escape' });
  assert.match(menuDmdValue(h, s, 'format'), /^4:1/);
});

test('écran de réglage : masquer grise les lignes de place, avec la raison ; quitter sans enregistrer pose la question', () => {
  const h = host();
  const s = startMenuDmdEditor(menuDmdSpot(h.auto, undefined));
  assert.ok(menuDmdBlocked(h, s, 'auto'), 'déjà automatique');
  assert.equal(openMenuDmdItem(h, s, 'shown'), 'handled');
  assert.equal(s.spot.hidden, true);
  assert.equal(menuDmdValue(h, s, 'shown'), 'masqué');
  for (const id of ['moveX', 'moveY', 'size', 'format'] as const) assert.ok(menuDmdBlocked(h, s, id));
  assert.equal(openMenuDmdItem(h, s, 'moveX'), 'handled');
  assert.ok(s.notice);
  assert.equal(s.mode, undefined);
  // Revenir : la question ; « Abandonner » rend ce qui était enregistré.
  assert.equal(openMenuDmdItem(h, s, 'back'), 'handled');
  assert.equal(s.leaving, true);
  assert.equal(menuDmdKey(h, s, KEYS, { code: 'ShiftRight' }), 'unhandled');
  assert.deepEqual(answerMenuDmdLeave(s, 1), { back: true });
  assert.equal(s.spot.hidden, false);
  // « Enregistrer » ; « Continuer le réglage » reste.
  openMenuDmdItem(h, s, 'shown');
  openMenuDmdItem(h, s, 'back');
  assert.deepEqual(answerMenuDmdLeave(s, 0), { back: true, save: true });
  openMenuDmdItem(h, s, 'back');
  assert.equal(answerMenuDmdLeave(s, 2), 'handled');
  assert.equal(s.leaving, false);
  // Sans changement, on revient directement.
  const clean = startMenuDmdEditor(menuDmdSpot(h.auto, undefined));
  assert.deepEqual(openMenuDmdItem(h, clean, 'back'), { back: true });
});

test('« Revenir à la place automatique » : la place automatique, affichée', () => {
  const h = host(true);
  const s = startMenuDmdEditor({ zone: { x: 0, y: 0, width: 0.5, height: 0.1 }, hidden: true });
  assert.equal(menuDmdBlocked(h, s, 'auto'), undefined);
  assert.equal(openMenuDmdItem(h, s, 'auto'), 'auto');
  markMenuDmdAuto(h, s);
  assert.deepEqual(s.spot, { zone: h.auto, hidden: false });
  assert.equal(menuDmdDirty(s), false);
});
