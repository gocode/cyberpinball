// Animations des LED hors partie : réglages (lecture sûre, écriture), palette de la table, moteur
// (luminosité maximale jamais dépassée, transitions, aucun hasard) et contrôleur de l'application
// (rien ne tourne sans LED, l'ambiance se tait dès qu'une partie se prépare, l'essai des bandes garde la main).
//
// Le contrôleur et le pilote sont chargés depuis app/dist (compilé avant les tests) avec un pilote
// simulé : aucun port, aucun réseau, rien à l'écran.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_LED_ANIMATIONS,
  LED_AMBIENT_CEILING,
  LED_AMBIENT_STYLES,
  LED_BRIGHTNESS_CHOICES,
  LED_FIXED_COLORS,
  LED_SPEEDS,
  LedAmbientEngine,
  ledAnimationsFile,
  ledFixedColorId,
  ledPalette,
  normalizeLedAnimations,
  readLedAnimations,
  rgbToHsv,
  writeLedAnimations,
  type CabinetLeds,
  type LedAnimationSettings,
  type LedGrid,
  type LedStripSpec,
} from '../index';

const strip = (over: Partial<LedStripSpec> = {}): LedStripSpec => ({
  name: 'Bande',
  output: 1,
  width: 1,
  height: 20,
  arrangement: 'TopDownLeftRight',
  colorOrder: 'GRB',
  brightness: 100,
  dofOutput: 1,
  ...over,
});
const teensy = (strips: LedStripSpec[]): CabinetLeds => ({ controller: 'TeensyStripController', port: 'COM7', strips });
const withDir = (run: (dir: string) => void | Promise<void>) => async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ledanim-'));
  try {
    await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
const settings = (over: Partial<LedAnimationSettings> = {}): LedAnimationSettings => normalizeLedAnimations({ ...DEFAULT_LED_ANIMATIONS, ...over });
const grid: LedGrid = { width: 1, height: 20, arrangement: 'TopDownLeftRight' };
const peak = (rgb: Uint8Array) => rgb.reduce((m, v) => Math.max(m, v), 0);
const sum = (rgb: Uint8Array) => rgb.reduce((a, v) => a + v, 0);

// --- Réglages ---------------------------------------------------------------------------------

test('Animations LED : des valeurs sûres par défaut, et tout réglage illisible les retrouve', () => {
  assert.equal(DEFAULT_LED_ANIMATIONS.enabled, true);
  assert.ok(DEFAULT_LED_ANIMATIONS.brightness <= 40, 'luminosité modérée par défaut');
  assert.deepEqual(normalizeLedAnimations(undefined), DEFAULT_LED_ANIMATIONS);
  assert.deepEqual(normalizeLedAnimations('n’importe quoi'), DEFAULT_LED_ANIMATIONS);
  assert.deepEqual(normalizeLedAnimations({ style: 'disco', speed: 3, color: 'rouge', brightness: 'fort', enabled: 'oui', idleMinutes: NaN }), DEFAULT_LED_ANIMATIONS);
  assert.equal(normalizeLedAnimations({ brightness: 5000 }).brightness, 100);
  assert.equal(normalizeLedAnimations({ brightness: -4 }).brightness, 5);
  assert.equal(normalizeLedAnimations({ idleMinutes: -9 }).idleMinutes, 0);
  assert.equal(normalizeLedAnimations({ color: ' #FF7A1A ' }).color, '#ff7a1a');
  for (const style of LED_AMBIENT_STYLES) assert.equal(normalizeLedAnimations({ style }).style, style);
});

test(
  'Animations LED : écriture puis relecture, fichier absent ou abîmé = valeurs par défaut',
  withDir((dir) => {
    assert.deepEqual(readLedAnimations(dir), DEFAULT_LED_ANIMATIONS);
    const wanted = settings({ enabled: false, style: 'embers', brightness: 60, speed: 'slow', followTable: false, color: '#2f6bff', idleMinutes: 0 });
    writeLedAnimations(dir, wanted);
    assert.deepEqual(readLedAnimations(dir), wanted);
    assert.deepEqual(fs.readdirSync(dir), ['led-animations.json'], 'aucun fichier temporaire ne reste');
    fs.writeFileSync(ledAnimationsFile(dir), '{ pas du json');
    assert.deepEqual(readLedAnimations(dir), DEFAULT_LED_ANIMATIONS);
    fs.writeFileSync(ledAnimationsFile(dir), JSON.stringify({ brightness: 9999, style: 'wave' }));
    assert.equal(readLedAnimations(dir).brightness, 100);
    assert.equal(readLedAnimations(dir).style, 'wave');
  }),
);

test('Animations LED : les couleurs fixes proposées sont des #rrggbb distincts et se retrouvent par leur identité', () => {
  const hexes = LED_FIXED_COLORS.map((c) => c.hex);
  assert.equal(new Set(hexes).size, hexes.length);
  for (const c of LED_FIXED_COLORS) {
    assert.match(c.hex, /^#[0-9a-f]{6}$/);
    assert.equal(ledFixedColorId(c.hex), c.id);
  }
  assert.equal(ledFixedColorId('#123456'), undefined);
});

// --- Palette ----------------------------------------------------------------------------------

test('Animations LED : la palette garde la teinte de la table, saturée pour une LED, sans hasard', () => {
  for (const hex of ['#7fd6c9', '#d98cff', '#ffb36b', '#8fb4ff', '#ff8f8f']) {
    const p = ledPalette(hex);
    const [hTable] = rgbToHsv([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
    const [h, s, v] = rgbToHsv(p.primary);
    assert.ok(s >= 0.84, `${hex} : saturée (${s.toFixed(2)})`);
    assert.ok(v >= 0.99, `${hex} : pleine`);
    const gap = Math.abs(((h - hTable + 540) % 360) - 180);
    assert.ok(gap < 3, `${hex} : même teinte (écart ${gap.toFixed(1)}°)`);
    assert.deepEqual(ledPalette(hex), p);
  }
});

test('Animations LED : sans teinte, ou avec une teinte illisible, la palette est celle de la marque', () => {
  assert.deepEqual(ledPalette(undefined), ledPalette(LED_FIXED_COLORS[0].hex));
  assert.deepEqual(ledPalette('pas une couleur'), ledPalette(undefined));
});

test('Animations LED : un blanc chaud reste un blanc, il n’est pas teinté de force', () => {
  const [, s] = rgbToHsv(ledPalette('#ffffff').primary);
  assert.ok(s < 0.15);
});

// --- Moteur -----------------------------------------------------------------------------------

test('Animations LED : aucune LED ne dépasse la luminosité maximale, quel que soit le style, la vitesse ou la transition', () => {
  for (const brightness of [5, ...LED_BRIGHTNESS_CHOICES]) {
    const cap = Math.round((255 * brightness) / 100);
    for (const style of LED_AMBIENT_STYLES) {
      for (const speed of LED_SPEEDS) {
        const engine = new LedAmbientEngine(settings({ brightness, style, speed }));
        engine.setTint('#ff8f8f', 0, true);
        engine.sweep(1000, 1);
        engine.sweep(1100, -1);
        engine.arrive(1500);
        for (let t = 0; t < 12_000; t += 137) {
          const out = engine.render(grid, t);
          assert.equal(out.length, 60);
          assert.ok(peak(out) <= cap, `${style}/${speed}/${brightness} % à ${t} ms : ${peak(out)} > ${cap}`);
        }
      }
    }
  }
});

test('Animations LED : l’ambiance seule laisse de la marge aux transitions', () => {
  const brightness = 100;
  for (const style of LED_AMBIENT_STYLES) {
    const engine = new LedAmbientEngine(settings({ brightness, style }));
    let high = 0;
    for (let t = 0; t < 60_000; t += 97) high = Math.max(high, peak(engine.render(grid, t)));
    // Gamma 2 : le plafond de 70 % donne au plus 49 % de la valeur maximale.
    assert.ok(high <= Math.ceil(255 * LED_AMBIENT_CEILING ** 2) + 1, `${style} : ${high}`);
    assert.ok(high > 0, `${style} : jamais noire`);
  }
});

test('Animations LED : chaque style allume la bande et change avec le temps', () => {
  for (const style of LED_AMBIENT_STYLES) {
    const engine = new LedAmbientEngine(settings({ style, brightness: 100 }));
    const frames = [0, 2500, 5000, 9000, 14_000].map((t) => engine.render(grid, t));
    assert.ok(frames.every((f) => sum(f) > 0), `${style} : allumée en permanence`);
    assert.ok(new Set(frames.map((f) => f.join(','))).size > 1, `${style} : l’image évolue`);
  }
});

test('Animations LED : une image ne dépend que de l’instant (aucun hasard), même d’un moteur à l’autre', () => {
  for (const style of LED_AMBIENT_STYLES) {
    const a = new LedAmbientEngine(settings({ style }));
    const b = new LedAmbientEngine(settings({ style }));
    for (const t of [0, 333, 4242, 99_999]) assert.deepEqual(a.render(grid, t), b.render(grid, t), `${style} à ${t} ms`);
    assert.deepEqual(a.render(grid, 4242), a.render(grid, 4242));
  }
});

test('Animations LED : la matrice est rendue en entier, les bandes d’une LED aussi', () => {
  const engine = new LedAmbientEngine(settings({ style: 'wave', brightness: 100 }));
  assert.equal(engine.render({ width: 8, height: 4, arrangement: 'TopDownLeftRight' }, 3000).length, 8 * 4 * 3);
  assert.equal(engine.render({ width: 1, height: 1, arrangement: 'TopDownLeftRight' }, 3000).length, 3);
});

test('Animations LED : la luminosité réglée change bien le niveau', () => {
  const at = (brightness: number) => sum(new LedAmbientEngine(settings({ brightness, style: 'drift' })).render(grid, 5000));
  assert.ok(at(20) < at(40));
  assert.ok(at(40) < at(100));
});

test('Animations LED : la vitesse change le rythme', () => {
  const at = (speed: 'slow' | 'fast') => new LedAmbientEngine(settings({ speed, style: 'breath', brightness: 100 })).render(grid, 3000).join(',');
  assert.notEqual(at('slow'), at('fast'));
});

test('Animations LED : le fondu de palette passe par le milieu puis arrive à la nouvelle teinte', () => {
  const engine = new LedAmbientEngine(settings());
  engine.setTint('#d98cff', 0, true);
  const from = engine.palette(0).primary;
  engine.setTint('#ffb36b', 10_000);
  assert.ok(engine.busy(10_100));
  assert.deepEqual(engine.palette(10_000).primary, from, 'départ : la palette montrée');
  const mid = engine.palette(10_450).primary;
  const end = engine.palette(11_000).primary;
  assert.deepEqual(end, ledPalette('#ffb36b').primary);
  assert.notDeepEqual(mid, from);
  assert.notDeepEqual(mid, end);
  assert.equal(engine.busy(11_000), false);
  // Un fondu interrompu repart de ce qui est montré, sans saut.
  const e2 = new LedAmbientEngine(settings());
  e2.setTint('#d98cff', 0, true);
  e2.setTint('#ffb36b', 1000);
  const shown = e2.palette(1450).primary;
  e2.setTint('#8fb4ff', 1450);
  assert.deepEqual(e2.palette(1450).primary, shown);
});

test('Animations LED : sans suivre la table, la teinte est ignorée et la couleur fixe reste', () => {
  const engine = new LedAmbientEngine(settings({ followTable: false, color: '#2f6bff' }));
  engine.setTint('#ffb36b', 0, true);
  assert.deepEqual(engine.palette(0), ledPalette('#2f6bff'));
  const follow = new LedAmbientEngine(settings({ followTable: true, color: '#2f6bff' }));
  follow.setTint('#ffb36b', 0, true);
  assert.deepEqual(follow.palette(0), ledPalette('#ffb36b'));
  follow.setTint(undefined, 0, true);
  assert.deepEqual(follow.palette(0), ledPalette('#2f6bff'), 'table sans teinte : couleur fixe');
});

test('Animations LED : le balayage traverse la bande dans le sens demandé, puis l’ambiance reprend', () => {
  const style = { style: 'breath' as const, brightness: 100 };
  const lit = (dir: 1 | -1, at: number) => {
    const engine = new LedAmbientEngine(settings(style));
    const plain = engine.render(grid, 100_000 + at);
    engine.sweep(100_000, dir);
    const out = engine.render(grid, 100_000 + at);
    let best = 0;
    let where = 0;
    for (let k = 0; k < 20; k++) {
      const gain = out[k * 3]! + out[k * 3 + 1]! + out[k * 3 + 2]! - (plain[k * 3]! + plain[k * 3 + 1]! + plain[k * 3 + 2]!);
      if (gain > best) {
        best = gain;
        where = k;
      }
    }
    return { best, where };
  };
  const early = lit(1, 250);
  const late = lit(1, 600);
  assert.ok(early.best > 0 && late.best > 0, 'le balayage se voit');
  assert.ok(late.where > early.where, 'vers la fin de la bande');
  const back = lit(-1, 250);
  const backLate = lit(-1, 600);
  assert.ok(backLate.where < back.where, 'vers le début de la bande');
  const engine = new LedAmbientEngine(settings(style));
  const plain = engine.render(grid, 105_000);
  engine.sweep(100_000, 1);
  assert.equal(engine.busy(100_500), true);
  assert.equal(engine.busy(101_000), false);
  assert.deepEqual(engine.render(grid, 105_000), plain, 'après le balayage, l’ambiance seule');
});

test('Animations LED : l’arrivée sur la fiche pulse puis s’éteint', () => {
  const engine = new LedAmbientEngine(settings({ style: 'drift', brightness: 100 }));
  const plain = sum(engine.render(grid, 200_000 + 150));
  engine.arrive(200_000);
  assert.ok(sum(engine.render(grid, 200_000 + 150)) > plain, 'une pulsation s’ajoute');
  assert.equal(engine.busy(200_000 + 1100), true);
  assert.equal(engine.busy(200_000 + 1300), false);
  assert.deepEqual(engine.render(grid, 205_000), new LedAmbientEngine(settings({ style: 'drift', brightness: 100 })).render(grid, 205_000));
});

// --- Contrôleur de l'application ---------------------------------------------------------------

interface Service {
  configure(l: CabinetLeds | undefined): void;
  start(): Promise<{ state: string }>;
  stop(): Promise<void>;
  setColor(target: string, color: readonly [number, number, number], layer?: string): void;
  blackout(): void;
  step(): Promise<void>;
  gameStarted(): Promise<void>;
  gameEnded(): void;
  status(): { state: string };
  readonly leds: CabinetLeds | undefined;
  simulation: { device: { shownOutput(output: number, count: number): Uint8Array } } | undefined;
}
interface Controller {
  update(c: { phase: string; tableKey?: string; index?: number; ficheKey?: string; tint?: string }): void;
  settings(): LedAnimationSettings;
  change(patch: Partial<LedAnimationSettings>): void;
  available(): boolean;
  readonly running: boolean;
  dispose(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const driver = require(path.resolve(__dirname, '../../../../app/dist/led-live.js')) as { createLedService(o: Record<string, unknown>): Service };
const animationsModule = require(path.resolve(__dirname, '../../../../app/dist/led-animations.js')) as {
  createLedAnimations(o: Record<string, unknown>): Controller;
  LED_AMBIENT_PHASES: readonly string[];
};
/* eslint-enable @typescript-eslint/no-require-imports */

const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise<void>((resolve) => setImmediate(resolve));
};

interface Bench {
  dir: string;
  service: Service;
  controller: Controller;
  /** Minuterie factice : le test fait battre les images à la main. */
  timer: { active: boolean; beat(): Promise<void> };
  clock: { now: number };
  idle: { ms: number };
  config: { leds: CabinetLeds | undefined };
}
function bench(dir: string, leds: CabinetLeds | undefined = teensy([strip()]), initial?: Partial<LedAnimationSettings>): Bench {
  if (initial) writeLedAnimations(dir, settings(initial));
  const service = driver.createLedService({ simulated: true, manual: true, resumeDelayMs: 10 });
  const config = { leds };
  const clock = { now: 1_000_000 };
  const idle = { ms: 0 };
  let beat: (() => void) | undefined;
  const timer = {
    get active() {
      return beat !== undefined;
    },
    async beat() {
      beat?.();
      await service.step();
    },
  };
  const controller = animationsModule.createLedAnimations({
    service,
    dataDir: dir,
    leds: () => config.leds,
    idleFor: () => idle.ms,
    now: () => clock.now,
    setInterval: (run: () => void) => {
      beat = run;
      return 1;
    },
    clearInterval: () => {
      beat = undefined;
    },
  });
  return { dir, service, controller, timer, clock, idle, config };
}
const shown = (b: Bench, count = 20) => b.service.simulation!.device.shownOutput(0, count);

test(
  'Animations LED : au repos dans un menu, les bandes s’allument d’elles-mêmes',
  withDir(async (dir) => {
    const b = bench(dir);
    assert.equal(b.controller.available(), true);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0, tint: '#7fd6c9' });
    await settle();
    assert.equal(b.service.status().state, 'running');
    assert.equal(b.controller.running, true);
    await b.timer.beat();
    assert.ok(sum(shown(b)) > 0, 'les LED montrent quelque chose');
    assert.ok(peak(shown(b)) <= Math.round((255 * DEFAULT_LED_ANIMATIONS.brightness) / 100), 'sous la luminosité réglée');
    b.controller.dispose();
    await b.service.stop();
  }),
);

test(
  'Animations LED : dès qu’une partie se prépare, l’ambiance se tait et rien ne rouvre le port',
  withDir(async (dir) => {
    const b = bench(dir);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.timer.beat();
    assert.ok(sum(shown(b)) > 0);
    // La partie se prépare : le pilote rend le port.
    await b.service.gameStarted();
    b.controller.update({ phase: 'loading', tableKey: 'a.vpx', index: 0 });
    await settle();
    assert.equal(b.controller.running, false, 'plus de minuterie');
    assert.equal(b.service.status().state, 'paused-by-game');
    for (const phase of ['loading', 'playing', 'intro']) {
      b.controller.update({ phase });
      await settle();
      assert.equal(b.controller.running, false, phase);
      assert.equal(b.service.status().state, 'paused-by-game', `${phase} : le port reste à la partie`);
    }
    // Même un écran de menu pendant la partie (message, pause) ne rouvre rien.
    b.controller.update({ phase: 'message' });
    await settle();
    assert.equal(b.service.status().state, 'paused-by-game');
    assert.equal(b.controller.running, false);
    b.controller.dispose();
  }),
);

test(
  'Animations LED : après la partie, le pilote rouvre le port et l’ambiance revient',
  withDir(async (dir) => {
    const b = bench(dir);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.service.gameStarted();
    b.controller.update({ phase: 'playing' });
    await settle();
    b.service.gameEnded();
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    await settle();
    assert.notEqual(b.service.status().state, 'paused-by-game');
    b.controller.dispose();
    await b.service.stop();
  }),
);

test('Animations LED : seuls la roue, les menus, les messages et le Juke-box sont des écrans d’ambiance', () => {
  assert.deepEqual([...animationsModule.LED_AMBIENT_PHASES].sort(), ['confirmQuit', 'jukebox', 'library', 'menu', 'message']);
  for (const phase of ['intro', 'loading', 'playing']) assert.ok(!animationsModule.LED_AMBIENT_PHASES.includes(phase), phase);
});

test(
  'Animations LED : rien ne tourne sans bande, avec les animations éteintes, ou sur une carte qui porte ses bandes',
  withDir(async (dir) => {
    const cases: { name: string; leds: CabinetLeds | undefined; initial?: Partial<LedAnimationSettings> }[] = [
      { name: 'aucune description', leds: undefined },
      { name: 'aucune bande', leds: teensy([]) },
      { name: 'animations éteintes', leds: teensy([strip()]), initial: { enabled: false } },
      { name: 'carte DudesCab', leds: { controller: 'DudesCab', port: '', strips: [strip()] } },
    ];
    for (const c of cases) {
      const sub = fs.mkdtempSync(path.join(dir, 'c-'));
      const b = bench(sub, c.leds, c.initial);
      b.config.leds = c.leds;
      b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
      await settle();
      assert.equal(b.controller.running, false, `${c.name} : pas de minuterie`);
      assert.equal(b.timer.active, false, `${c.name} : aucune minuterie posée`);
      assert.equal(b.service.status().state, 'closed', `${c.name} : aucun port ouvert`);
      b.controller.dispose();
    }
  }),
);

test(
  'Animations LED : après l’inactivité réglée, les LED s’éteignent, et reviennent au premier geste',
  withDir(async (dir) => {
    const b = bench(dir, teensy([strip()]), { idleMinutes: 5 });
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.timer.beat();
    assert.ok(sum(shown(b)) > 0);
    b.idle.ms = 5 * 60_000 + 1;
    await b.timer.beat();
    assert.equal(b.controller.running, false, 'minuterie arrêtée');
    await b.service.step();
    assert.equal(sum(shown(b)), 0, 'bande éteinte');
    // Un geste (l’inactivité repart de zéro) : l’écran change, l’ambiance revient.
    b.idle.ms = 0;
    b.controller.update({ phase: 'menu', tableKey: 'b.vpx', index: 1 });
    await settle();
    assert.equal(b.controller.running, true);
    await b.timer.beat();
    assert.ok(sum(shown(b)) > 0);
    b.controller.dispose();
    await b.service.stop();
  }),
);

test(
  'Animations LED : « jamais » n’éteint jamais',
  withDir(async (dir) => {
    const b = bench(dir, teensy([strip()]), { idleMinutes: 0 });
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    b.idle.ms = 99 * 3_600_000;
    await b.timer.beat();
    assert.ok(sum(shown(b)) > 0);
    b.controller.dispose();
    await b.service.stop();
  }),
);

test(
  'Animations LED : un changement de réglage est enregistré et se voit aussitôt ; éteindre rend le port',
  withDir(async (dir) => {
    const b = bench(dir);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.timer.beat();
    b.controller.change({ brightness: 10 });
    assert.equal(readLedAnimations(dir).brightness, 10, 'écrit sur le disque');
    await b.timer.beat();
    assert.ok(peak(shown(b)) <= Math.round(25.5), 'plafonnée à 10 %');
    b.controller.change({ brightness: 7777 });
    assert.equal(b.controller.settings().brightness, 100, 'valeur bornée');
    b.controller.change({ enabled: false });
    await settle();
    assert.equal(readLedAnimations(dir).enabled, false);
    assert.equal(b.controller.running, false);
    assert.equal(b.service.status().state, 'closed', 'le port est rendu');
    b.controller.dispose();
  }),
);

test(
  'Animations LED : l’essai des bandes de l’écran de configuration garde la main',
  withDir(async (dir) => {
    const b = bench(dir);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.timer.beat();
    // L’écran de configuration ouvre la liaison avec une autre description (essai) et colore une LED.
    await b.service.stop();
    b.service.configure(teensy([strip({ height: 6 })]));
    await b.service.start();
    b.service.setColor('*', [255, 0, 0], 'test');
    b.controller.update({ phase: 'menu', tableKey: 'b.vpx', index: 1 });
    await settle();
    assert.equal(b.controller.running, false, 'pas de minuterie pendant l’essai');
    assert.equal(b.service.leds?.strips[0]?.height, 6, 'la description d’essai est intacte');
    await b.service.step();
    assert.equal(peak(b.service.simulation!.device.shownOutput(0, 6)), 255, 'la couleur d’essai pleine reste affichée, sans ambiance par-dessus');
    b.controller.dispose();
    await b.service.stop();
  }),
);

test(
  'Animations LED : le balayage de la roue part au changement de table, pas à un simple nouvel état',
  withDir(async (dir) => {
    const b = bench(dir, teensy([strip()]), { style: 'drift', brightness: 100 });
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.timer.beat();
    const calm = Array.from(shown(b));
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await b.timer.beat();
    assert.deepEqual(Array.from(shown(b)), calm, 'même table : même image (horloge figée)');
    b.controller.update({ phase: 'menu', tableKey: 'b.vpx', index: 1 });
    b.clock.now += 300;
    await b.timer.beat();
    assert.ok(sum(shown(b)) > sum(Uint8Array.from(calm)), 'nouvelle table : un balayage s’ajoute');
    b.clock.now += 5000;
    await b.timer.beat();
    b.controller.dispose();
    await b.service.stop();
  }),
);
