// Root Access, le jeu caché : la combinaison qui l'ouvre depuis la roue, les commandes de la borne qu'il
// reçoit, et ce que son moteur (app/renderer/root-access/engine.js) en fait : lanceur analogique comme à
// bouton, flips indépendants du lanceur.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_BUTTONS, windowsVk } from '../buttons';
import type { CabinetButtons } from '../model';
import { COMBO_GAP_MS, FlipperCombo, miniGameInput, miniGameKeys, plungerPull, ROOT_ACCESS_SEQUENCE, sameMiniGameInput, type MiniGameButton, type MiniGameInput } from '../root-access';
import { REPO_ROOT } from './i18n-scan';

const GAME_DIR = path.join(REPO_ROOT, 'app', 'renderer', 'root-access');

function combo(allowed = () => true) {
  let now = 0;
  let fired = 0;
  const c = new FlipperCombo({ left: () => ['ShiftLeft', 'SDLJoy_pad_1;5'], right: () => ['ShiftRight'], allowed, trigger: () => fired++, now: () => now });
  const press = (sides: string, gap = 200) => {
    for (const s of sides) {
      now += gap;
      c.press(s === 'G' ? 'ShiftLeft' : s === 'D' ? 'ShiftRight' : s === 'J' ? 'SDLJoy_pad_1;5' : 'Enter');
    }
  };
  return { c, press, fired: () => fired, wait: (ms: number) => (now += ms) };
}

test('la combinaison : G, D, GG, DD, GGG, DDD ; autant de pas de chaque côté, la roue revient sur sa table', () => {
  assert.deepEqual(ROOT_ACCESS_SEQUENCE.map((s) => (s === 'left' ? 'G' : 'D')).join(''), 'GDGGDDGGGDDD');
  assert.equal(ROOT_ACCESS_SEQUENCE.filter((s) => s === 'left').length, ROOT_ACCESS_SEQUENCE.filter((s) => s === 'right').length);
  const k = combo();
  k.press('GDGGDDGGGDD');
  assert.equal(k.fired(), 0, 'pas avant le dernier flip');
  k.press('D');
  assert.equal(k.fired(), 1);
  k.press('D');
  assert.equal(k.fired(), 1, 'un flip de plus ne rouvre pas');
});

test('la combinaison : des flips avant elle ne gênent pas, un bouton de joystick vaut la touche', () => {
  const k = combo();
  k.press('DDGGG' + 'GDGGDDGGGDDD');
  assert.equal(k.fired(), 1);
  const j = combo();
  j.press('JDJJDDJJJDDD');
  assert.equal(j.fired(), 1);
});

test('la combinaison repart de zéro : pause trop longue, autre bouton, hors de la roue, remise à zéro', () => {
  const lent = combo();
  lent.press('GDGGDD');
  lent.wait(COMBO_GAP_MS + 1);
  lent.press('GGGDDD');
  assert.equal(lent.fired(), 0, 'pause');
  lent.press('GDGGDDGGGDDD', COMBO_GAP_MS - 1);
  assert.equal(lent.fired(), 1, 'sans pause de trop, à son rythme');

  const autre = combo();
  autre.press('GDGGDDGG');
  autre.press('X');
  autre.press('GDDD');
  assert.equal(autre.fired(), 0, 'autre bouton');

  let ok = true;
  const ailleurs = combo(() => ok);
  ailleurs.press('GDGGDD');
  ok = false;
  ailleurs.press('G');
  ok = true;
  ailleurs.press('GGDDD');
  assert.equal(ailleurs.fired(), 0, 'hors de la roue');

  const reset = combo();
  reset.press('GDGGDDGGG');
  reset.c.reset();
  reset.press('DDD');
  assert.equal(reset.fired(), 0, 'remise à zéro');
});

test('les boutons du jeu : ceux relevés pour la borne, ses défauts sans relevé valable', () => {
  const defaults = miniGameKeys(undefined);
  assert.equal(defaults.leftFlipper, DEFAULT_BUTTONS.leftFlipper);
  assert.equal(defaults.rightFlipper, DEFAULT_BUTTONS.rightFlipper);
  assert.equal(defaults.plunger, DEFAULT_BUTTONS.plunger);
  assert.equal(defaults.exit, DEFAULT_BUTTONS.exit);
  const joy = miniGameKeys({ ...DEFAULT_BUTTONS, leftFlipper: 'SDLJoy_03000000fa190000ed00000000000000_1;3', plunger: 'SDLJoy_03000000fa190000ed00000000000000_1;7' });
  assert.equal(joy.leftFlipper, 'SDLJoy_03000000fa190000ed00000000000000_1;3');
  assert.equal(joy.plunger, 'SDLJoy_03000000fa190000ed00000000000000_1;7');
});

test('les commandes du jeu : flips, lanceur, un MagnaSave ou l\'autre pour l\'aimant, tirette bornée', () => {
  const held = (...b: MiniGameButton[]) => new Set(b);
  assert.deepEqual(miniGameInput(held('leftFlipper', 'plunger')), { left: true, right: false, plunger: true, aimant: false });
  assert.equal(miniGameInput(held('rightMagna')).aimant, true);
  assert.equal(miniGameInput(held('leftMagna')).aimant, true);
  assert.equal(miniGameInput(held(), 1.4).tirette, 1);
  assert.equal(miniGameInput(held(), -0.2).tirette, 0);
  assert.equal('tirette' in miniGameInput(held(), Number.NaN), false);
  // Rien d'autre que des changements ne repart vers la page, mais le moindre écart de tirette repart :
  // la retombée au repos est le lâcher que le jeu attend.
  assert.equal(sameMiniGameInput(miniGameInput(held(), 0.051), miniGameInput(held(), 0.05)), false);
  assert.equal(sameMiniGameInput(miniGameInput(held('leftFlipper')), miniGameInput(held('leftFlipper'))), true);
  assert.equal(sameMiniGameInput(undefined, miniGameInput(held())), false);
});

test('la tirette : l\'axe réglé, zone morte et sens compris ; poussée vers l\'avant comptée au repos', () => {
  const sensor = { device: 'pinscape', axis: 2, reversed: false, deadZone: 0.1 };
  const axes = (v: number) => [{ device: 'autre', name: 'x', values: [0.9, 0.9, 0.9] }, { device: 'pinscape', name: 'mjrnet Pinscape Controller', values: [0, 0, v] }];
  const near = (v: number | undefined, want: number, what: string) => assert.ok(v !== undefined && Math.abs(v - want) < 1e-9, `${what} : ${v}`);
  near(plungerPull(axes(0.55), sensor), 0.5, 'tirée à mi-course');
  assert.equal(plungerPull(axes(0.05), sensor), 0, 'zone morte');
  assert.equal(plungerPull(axes(-0.6), sensor), 0, 'poussée');
  near(plungerPull(axes(-0.55), { ...sensor, reversed: true }), 0.5, 'axe inversé');
  assert.equal(plungerPull(axes(0.5), undefined), undefined, 'lanceur à bouton');
  assert.equal(plungerPull([], sensor), undefined, 'joystick absent');
});

// ---------- Le relais de la borne vers la page (app/src/root-access-relay.ts) ----------

interface RelayModule {
  relayCabinet(input: {
    buttons: CabinetButtons | undefined;
    plungerSensor: { device: string; axis: number; reversed: boolean; deadZone: number } | undefined;
    axes(): { device: string; name: string; values: number[] }[];
    keysDown(vks: readonly number[]): number[];
    watchJoystick(listener: (code: string, down: boolean) => void): () => void;
    send(input: MiniGameInput): void;
    activity(): void;
    exit(): void;
    pollMs: number;
  }): { tick(): void; resend(): void; stop(): void };
}
const relayModule = (): RelayModule => require(path.join(REPO_ROOT, 'app', 'dist', 'root-access-relay.js')) as RelayModule;

function cabinetRelay(buttons: CabinetButtons | undefined, sensor?: { device: string; axis: number; reversed: boolean; deadZone: number }) {
  const keys = new Set<number>();
  let axis = 0;
  let joyListener: ((code: string, down: boolean) => void) | undefined;
  let joyStopped = false;
  const sent: MiniGameInput[] = [];
  let activity = 0;
  let exits = 0;
  const relay = relayModule().relayCabinet({
    buttons,
    plungerSensor: sensor,
    axes: () => [{ device: 'pinscape', name: 'Pinscape', values: [0, 0, axis] }],
    keysDown: (vks) => vks.filter((v) => keys.has(v)),
    watchJoystick: (l) => {
      joyListener = l;
      return () => {
        joyStopped = true;
      };
    },
    send: (i) => sent.push(i),
    activity: () => activity++,
    exit: () => exits++,
    pollMs: 0,
  });
  const vk = (code: string) => windowsVk(code)!;
  return {
    relay,
    sent,
    last: (): MiniGameInput => sent[sent.length - 1]!,
    activity: () => activity,
    exits: () => exits,
    joyStopped: () => joyStopped,
    key(code: string, down: boolean) {
      if (down) keys.add(vk(code));
      else keys.delete(vk(code));
      relay.tick();
    },
    joy(code: string, down: boolean) {
      assert.ok(joyListener, 'le relais écoute le joystick');
      joyListener!(code, down);
    },
    pull(v: number) {
      axis = v;
      relay.tick();
    },
  };
}

test('relais : les touches de la borne deviennent l’état du jeu, envoyé seulement quand il change', () => {
  const r = cabinetRelay(DEFAULT_BUTTONS);
  r.relay.tick();
  assert.deepEqual(r.last(), { left: false, right: false, plunger: false, aimant: false }, 'état de départ envoyé');
  const count = r.sent.length;
  r.relay.tick();
  assert.equal(r.sent.length, count, 'rien de neuf : rien d’envoyé');
  r.key(DEFAULT_BUTTONS.leftFlipper!, true);
  assert.equal(r.last().left, true);
  r.key(DEFAULT_BUTTONS.rightFlipper!, true);
  assert.equal(r.last().right, true, 'les deux flips ensemble');
  r.key(DEFAULT_BUTTONS.leftFlipper!, false);
  assert.deepEqual([r.last().left, r.last().right], [false, true]);
  r.key(DEFAULT_BUTTONS.plunger!, true);
  assert.equal(r.last().plunger, true);
  assert.equal(r.activity(), 4, 'chaque geste sur un bouton compte pour le mode attente');
  r.relay.resend();
  r.relay.tick();
  assert.equal(r.sent.length, count + 5, 'page rechargée : l’état repart');
  assert.equal(r.exits(), 0);
});

test('relais : Exit ferme au nouvel appui, jamais s’il était déjà tenu à l’ouverture', () => {
  const held = cabinetRelay(DEFAULT_BUTTONS);
  held.key(DEFAULT_BUTTONS.exit!, true);
  held.relay.tick();
  assert.equal(held.exits(), 0, 'Exit tenu à l’ouverture');
  held.key(DEFAULT_BUTTONS.exit!, false);
  held.key(DEFAULT_BUTTONS.exit!, true);
  assert.equal(held.exits(), 1, 'nouvel appui');
  const fresh = cabinetRelay(DEFAULT_BUTTONS);
  fresh.relay.tick();
  fresh.key(DEFAULT_BUTTONS.exit!, true);
  assert.equal(fresh.exits(), 1);
});

test('relais : boutons de joystick et lanceur analogique réglés pour la borne', () => {
  const left = 'SDLJoy_03000000fa190000ed00000000000000_1;3';
  const plunger = 'SDLJoy_03000000fa190000ed00000000000000_1;7';
  const sensor = { device: 'pinscape', axis: 2, reversed: false, deadZone: 0.1 };
  const r = cabinetRelay({ ...DEFAULT_BUTTONS, leftFlipper: left, plunger }, sensor);
  r.relay.tick();
  assert.equal(r.last().tirette, 0, 'lanceur analogique au repos');
  r.joy(left, true);
  assert.equal(r.last().left, true, 'bouton de joystick');
  r.joy('SDLJoy_03000000fa190000ed00000000000000_1;12', true);
  r.joy(left, false);
  assert.equal(r.last().left, false);
  r.joy(plunger, true);
  assert.equal(r.last().plunger, true, 'bouton du lanceur à côté de la tirette');
  const before = r.activity();
  r.pull(0.55);
  assert.ok(Math.abs((r.last().tirette ?? 0) - 0.5) < 1e-9, `tirette : ${r.last().tirette}`);
  r.pull(0);
  assert.equal(r.last().tirette, 0, 'le retour au repos part toujours : il déclenche le tir');
  assert.equal(r.activity(), before, 'la tirette seule ne compte pas comme un geste (bruit du capteur)');
  r.key(DEFAULT_BUTTONS.rightFlipper!, true);
  assert.equal(r.last().right, true, 'le clavier reste lu à côté du joystick');
  r.relay.stop();
  assert.ok(r.joyStopped(), 'arrêt : le joystick n’est plus écouté');
  const n = r.sent.length;
  r.key(DEFAULT_BUTTONS.rightFlipper!, false);
  assert.equal(r.sent.length, n, 'arrêté : plus rien d’envoyé');
});

// ---------- Le moteur du jeu ----------

interface Input { left?: boolean; right?: boolean; plunger?: boolean; aimant?: boolean; tirette?: number }
interface Flipper { side: string; a: number; up: number; rest: number }
interface Game { status: string; charging: boolean; charge: number; tire: boolean; ball: { vy: number }; events: { type: string; charge?: number }[]; f: { flippers: Flipper[] } }
interface Engine { DT: number; createGame(levels: unknown): Game; step(g: Game, input: Input): void }
const E = require(path.join(GAME_DIR, 'engine.js')) as Engine;
const LEVELS = require(path.join(GAME_DIR, 'levels.js')) as unknown;

const NONE: Input = { left: false, right: false };
function run(g: Game, seconds: number, input: Input | ((t: number) => Input) = NONE): void {
  const n = Math.round(seconds / E.DT);
  for (let i = 0; i < n; i++) E.step(g, typeof input === 'function' ? input(i * E.DT) : input);
}
const launches = (g: Game) => g.events.filter((e) => e.type === 'lance');
const tirer = (pos: number): Input => ({ left: false, right: false, tirette: pos });

test('lanceur à bouton : la bille se charge tant qu\'on tient, part au relâchement ; tir automatique à 10 s', () => {
  const g = E.createGame(LEVELS);
  run(g, 3, { left: true, right: true });
  assert.equal(g.status, 'cradle', 'les flips ne lancent pas la bille');
  run(g, 0.5, { plunger: true });
  assert.ok(g.charging && Math.abs(g.charge - 0.5) < 0.01, `charge ${g.charge}`);
  run(g, E.DT);
  assert.equal(g.status, 'play');
  assert.ok(Math.abs(launches(g)[0]!.charge! - 0.5) < 0.01);
  const seul = E.createGame(LEVELS);
  run(seul, 9.9);
  assert.equal(seul.status, 'cradle');
  run(seul, 0.2);
  assert.equal(seul.status, 'play');
});

test('lanceur analogique : la tige suit la tirette, le tir part à la retombée avec la force du recul', () => {
  for (const recul of [1, 0.5]) {
    const g = E.createGame(LEVELS);
    run(g, 0.2, tirer(0));
    run(g, 0.6, tirer(recul));
    assert.equal(g.status, 'cradle', 'tirée, la bille attend');
    assert.ok(g.tire && Math.abs(g.charge - recul) < 1e-9, `la tige suit la tirette : ${g.charge}`);
    run(g, E.DT, tirer(0));
    assert.equal(g.status, 'play', 'relâchée, la bille part');
    assert.equal(launches(g).length, 1);
    assert.ok(Math.abs(launches(g)[0]!.charge! - recul) < 1e-9);
    // Même force qu'un bouton chargé autant.
    const b = E.createGame(LEVELS);
    run(b, recul, { plunger: true });
    run(b, E.DT);
    assert.ok(Math.abs(b.ball.vy - g.ball.vy) < 25, `bouton ${b.ball.vy}, analogique ${g.ball.vy}`);
  }
});

test('lanceur analogique : un lâcher tenu entre deux lectures de la borne tire à pleine force', () => {
  // Le processus principal lit l'axe toutes les 8 ms environ (2 pas du moteur) : le lâcher tient entre deux lectures.
  const g = E.createGame(LEVELS);
  const suite = [0.3, 0.7, 1, 1, 1, 0.98, 0];
  let i = 0;
  run(g, suite.length * 4 * E.DT, () => tirer(suite[Math.min(suite.length - 1, Math.floor(i++ / 4))]!));
  assert.equal(launches(g).length, 1);
  assert.equal(launches(g)[0]!.charge, 1);
});

test('lanceur analogique : petit recul, retour lent ou poussée vers l\'avant ne tirent pas', () => {
  const g = E.createGame(LEVELS);
  run(g, 0.3, tirer(0.15));
  run(g, 0.1, tirer(0));
  assert.equal(g.status, 'cradle', 'recul sous le seuil');
  // Raccompagnée en une seconde : comme VPX, seul compte le recul des 100 dernières ms.
  run(g, 0.3, tirer(1));
  run(g, 1, (t) => tirer(Math.max(0, 1 - t)));
  run(g, 0.1, tirer(0));
  assert.equal(g.status, 'cradle', 'retour lent');
  run(g, 0.3, tirer(-0.4));
  run(g, 0.1, tirer(0));
  assert.equal(g.status, 'cradle', 'poussée');
  assert.equal(launches(g).length, 0);
});

test('lanceur analogique : tenu tiré, pas de tir automatique ; au repos, le tir automatique reste', () => {
  const g = E.createGame(LEVELS);
  run(g, 12, tirer(0.8));
  assert.equal(g.status, 'cradle');
  run(g, E.DT, tirer(0));
  assert.equal(g.status, 'play');
  assert.ok(Math.abs(launches(g)[0]!.charge! - 0.8) < 1e-9);
  const repos = E.createGame(LEVELS);
  run(repos, 10.2, tirer(0.01));
  assert.equal(repos.status, 'play');
});

test('lanceur analogique au repos : le bouton de lancement tire aussi (les deux sur la même borne)', () => {
  const g = E.createGame(LEVELS);
  run(g, 0.5, { plunger: true, tirette: 0 });
  assert.ok(g.charging && Math.abs(g.charge - 0.5) < 0.01, `charge ${g.charge}`);
  run(g, E.DT, { tirette: 0 });
  assert.equal(g.status, 'play');
});

test('flips : levés tant que tenus, retombés au relâchement, quel que soit le lanceur', () => {
  for (const extra of [{}, { tirette: 0.6 }, { plunger: true }]) {
    const g = E.createGame(LEVELS);
    const gauche = g.f.flippers.find((f) => f.side === 'left')!;
    const droit = g.f.flippers.find((f) => f.side === 'right')!;
    run(g, 0.1, { left: true, right: false, ...extra });
    assert.equal(gauche.a, gauche.up, 'gauche levé');
    assert.equal(droit.a, droit.rest, 'droit au repos');
    run(g, 0.1, { left: false, right: true, ...extra });
    assert.equal(gauche.a, gauche.rest, 'gauche retombé');
    assert.equal(droit.a, droit.up, 'droit levé');
  }
});

test('la page du jeu : dans Cyber Pinball, seules les commandes de la borne comptent', () => {
  const game = fs.readFileSync(path.join(GAME_DIR, 'game.js'), 'utf8');
  // Les boutons arrivent par window.borne (root-access-preload.ts) ; la manette et les touches de la page
  // ne sont qu'un repli hors de Cyber Pinball (leurs numéros ne disent rien du rôle des boutons de la borne).
  assert.match(game, /if \(borne\) \{[\s\S]*?return input;\s*\}\s*const pad = readPad\(\);/);
  const preload = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'root-access-preload.ts'), 'utf8');
  assert.match(preload, /exposeInMainWorld\('borne'/);
  assert.match(preload, /'root-access:input'/);
  // Les scripts de la page, et rien qui sorte du jeu (CSP : default-src 'self').
  const html = fs.readFileSync(path.join(GAME_DIR, 'index.html'), 'utf8');
  for (const file of ['engine.js', 'levels.js', 'fx.js', 'da.js', 'game.js']) {
    assert.ok(html.includes(`src="${file}"`), file);
    assert.ok(fs.existsSync(path.join(GAME_DIR, file)), file);
  }
  assert.match(html, /default-src 'self'/);
});

// ---------- Bille perdue : redescendre d'un étage, perdre seulement au premier ----------

interface FloorGame extends Game { floor: number; score: number; camera: number; saveT: number; ball: { vy: number; x: number; y: number; vx: number } }
interface FloorEngine extends Engine { enterFloor(g: Game, k: number): void; release(g: Game): void; DESCENTE: number }
const EF = E as FloorEngine;
const FLOORS = (LEVELS as unknown[]).length;

/** La bille en jeu sous les flips, sans vitesse utile, sans sauve-bille : elle sort par le bas. */
function perdre(g: FloorGame): void {
  EF.release(g);
  g.saveT = 0;
  Object.assign(g.ball, { x: 360, y: 1300, vx: 0, vy: 500 });
}

test('bille perdue au premier étage : la partie est perdue', () => {
  const g = EF.createGame(LEVELS) as FloorGame;
  perdre(g);
  run(g, 0.5);
  assert.equal(g.status, 'dead');
  assert.equal(g.events.filter((e) => e.type === 'perdue').length, 1);
  assert.equal(g.events.filter((e) => e.type === 'descente').length, 0);
});

test('bille perdue à l\'étage 2 ou plus : elle redescend d\'un étage, score gardé, étage à rejouer', () => {
  const g = EF.createGame(LEVELS) as FloorGame;
  EF.enterFloor(g, 2);
  g.score = 1234;
  perdre(g);
  run(g, 0.5);
  assert.equal(g.status, 'descente');
  assert.equal(g.events.filter((e) => e.type === 'descente').length, 1);
  assert.equal(g.events.filter((e) => e.type === 'perdue').length, 0);
  run(g, 0.2);
  assert.ok(g.camera < 2 && g.camera > 1, `la caméra glisse vers l'étage du dessous (${g.camera})`);
  run(g, EF.DESCENTE + 0.2);
  assert.equal(g.floor, 1, 'étage du dessous');
  assert.equal(g.camera, 1);
  assert.equal(g.status, 'cradle', 'la bille attend au lanceur');
  assert.equal(g.score, 1234, 'le score reste');
});

test('bille perdue : on redescend étage par étage jusqu\'au premier, qui seul perd la partie', () => {
  const g = EF.createGame(LEVELS) as FloorGame;
  EF.enterFloor(g, FLOORS - 1);
  for (let k = FLOORS - 1; k > 0; k--) {
    perdre(g);
    run(g, 0.5 + EF.DESCENTE + 0.2);
    assert.equal(g.floor, k - 1);
    assert.equal(g.status, 'cradle');
  }
  perdre(g);
  run(g, 0.5);
  assert.equal(g.status, 'dead');
});

test('bille perdue : le sauve-bille reste prioritaire sur la descente', () => {
  const g = EF.createGame(LEVELS) as FloorGame;
  EF.enterFloor(g, 2);
  EF.release(g);
  g.saveT = 5;
  Object.assign(g.ball, { x: 360, y: 1300, vx: 0, vy: 500 });
  run(g, 0.5);
  assert.equal(g.floor, 2, 'même étage');
  assert.equal(g.status, 'cradle');
  assert.equal(g.events.filter((e) => e.type === 'sauve-bille').length, 1);
  assert.equal(g.events.filter((e) => e.type === 'descente').length, 0);
});
