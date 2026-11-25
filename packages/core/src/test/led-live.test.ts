// LED hors partie (led-live.ts du cœur, app/src/led-live.ts du pilote) : ordre des couleurs sur le fil,
// disposition des LED, découpage en sorties et en univers Art-Net, protocole Teensy / Wemos D1 parlé à
// un faux contrôleur, et pilote : le port est rendu dès qu'une partie se prépare, rien ne s'ouvre pendant
// une partie, les erreurs d'ouverture disent quoi faire.
//
// Le pilote est chargé depuis app/dist (compilé avant les tests) avec des transports simulés :
// aucun port, aucun réseau, rien à l'écran.

import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  LED_ARRANGEMENTS,
  LED_COLOR_ORDERS,
  LED_BLUE,
  LED_GREEN,
  LED_RED,
  SimulatedStripDevice,
  artnetFrames,
  artnetPacket,
  colorOrderFromSeen,
  compressLedRuns,
  createLedFrame,
  ledIndexAt,
  ledWireOutputs,
  ledXY,
  renderLedEffect,
  seenColor,
  stripFramePackets,
  stripSerialConfig,
  stripSetupPackets,
  wireColor,
  type CabinetLeds,
  type LedColorOrder,
  type LedStripSpec,
} from '../index';

const strip = (over: Partial<LedStripSpec> = {}): LedStripSpec => ({
  name: 'Bande',
  output: 1,
  width: 1,
  height: 4,
  arrangement: 'TopDownLeftRight',
  colorOrder: 'GRB',
  brightness: 100,
  dofOutput: 1,
  ...over,
});
const teensy = (strips: LedStripSpec[], extra: Partial<CabinetLeds> = {}): CabinetLeds => ({ controller: 'TeensyStripController', port: 'COM7', strips, ...extra });

// --- Ordre des couleurs -----------------------------------------------------------------------

test('LED : chaque ordre des couleurs met les octets dans l’ordre des puces', () => {
  const orders: Record<string, [number, number, number]> = { RGB: [10, 20, 30], GRB: [20, 10, 30], BRG: [30, 10, 20], BGR: [30, 20, 10], RBG: [10, 30, 20], GBR: [20, 30, 10] };
  for (const order of LED_COLOR_ORDERS) assert.deepEqual(wireColor(order, [10, 20, 30]), orders[order], order);
});

test('LED : « Si tu vois… » retrouve l’ordre réel quel que soit l’ordre décrit', () => {
  for (const configured of LED_COLOR_ORDERS) {
    for (const actual of LED_COLOR_ORDERS) {
      const seen = [LED_RED, LED_GREEN, LED_BLUE].map((c) => {
        const [r, g, b] = seenColor(configured, actual, c);
        return r > 0 ? 'R' : g > 0 ? 'G' : 'B';
      }) as [string, string, string];
      assert.equal(colorOrderFromSeen(configured, seen), actual, `décrit ${configured}, réel ${actual}`);
    }
  }
});

test('LED : une bande décrite GRB sur des puces GRB montre bien rouge, vert, bleu', () => {
  for (const order of LED_COLOR_ORDERS) {
    assert.deepEqual(seenColor(order, order, LED_RED), LED_RED, order);
    assert.deepEqual(seenColor(order, order, LED_GREEN), LED_GREEN, order);
    assert.deepEqual(seenColor(order, order, LED_BLUE), LED_BLUE, order);
  }
});

// --- Disposition ------------------------------------------------------------------------------

test('LED : colonne et ligne se retrouvent pour toutes les dispositions, sans trou ni doublon', () => {
  const grid = { width: 4, height: 3 };
  for (const arrangement of LED_ARRANGEMENTS) {
    const seen = new Set<string>();
    for (let k = 0; k < 12; k++) {
      const { x, y } = ledXY({ ...grid, arrangement }, k);
      assert.ok(x >= 0 && x < 4 && y >= 0 && y < 3, `${arrangement} : ${k} hors de la matrice`);
      seen.add(`${x},${y}`);
      assert.equal(ledIndexAt({ ...grid, arrangement }, x, y), k, `${arrangement} : réciproque de ${k}`);
    }
    assert.equal(seen.size, 12, `${arrangement} : chaque case une fois`);
  }
});

test('LED : le serpentin repart de l’autre bout à chaque ligne', () => {
  const g = { width: 3, height: 2, arrangement: 'LeftRightAlternateTopDown' as const };
  const order = [0, 1, 2, 3, 4, 5].map((k) => ledXY(g, k));
  assert.deepEqual(order, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
});

// --- Sorties du fil ---------------------------------------------------------------------------

test('LED : deux bandes sur une même sortie se suivent, chacune dans son ordre et sa luminosité', () => {
  const leds = teensy([strip({ name: 'A', height: 2, colorOrder: 'GRB' }), strip({ name: 'B', height: 1, colorOrder: 'RGB', brightness: 50 })]);
  const frame = createLedFrame(leds);
  frame[0]!.set([255, 0, 0, 0, 0, 255]);
  frame[1]!.set([255, 100, 0]);
  const [out] = ledWireOutputs(leds, frame);
  assert.deepEqual([...out!], [0, 255, 0, 0, 0, 255, 128, 50, 0]);
});

test('LED : la luminosité générale s’ajoute à celle de la bande', () => {
  const leds = teensy([strip({ height: 1, colorOrder: 'RGB', brightness: 50 })]);
  const frame = createLedFrame(leds);
  frame[0]!.set([200, 100, 0]);
  assert.deepEqual([...ledWireOutputs(leds, frame, 0.5)[0]!], [50, 25, 0]);
  assert.deepEqual([...ledWireOutputs(leds, frame, 0)[0]!], [0, 0, 0]);
});

test('LED : Art-Net, un univers de 512 canaux par sortie utilisée', () => {
  const leds: CabinetLeds = { controller: 'ArtNet', port: '', universe: 2, strips: [strip({ output: 1, height: 3 }), strip({ output: 3, height: 2 })] };
  const frames = artnetFrames(leds, ledWireOutputs(leds, createLedFrame(leds)));
  assert.equal(frames.length, 2, 'la sortie 2 est vide : pas de paquet');
  assert.ok(frames.every((f) => f.data.length === 512));
  const packet = artnetPacket(frames[0]!.universe, frames[0]!.data, 7);
  assert.equal(Buffer.from(packet.subarray(0, 8)).toString('latin1'), 'Art-Net\0');
  assert.deepEqual([...packet.subarray(8, 10)], [0x00, 0x50], 'opcode ArtDmx');
  assert.equal(packet[12], 7, 'numéro de séquence');
  assert.equal(packet.length, 18 + 512);
});

// --- Protocole série --------------------------------------------------------------------------

test('LED : la compression du Wemos garde les plages et ne dépasse pas 254', () => {
  const same = new Uint8Array(300 * 3).fill(9);
  const out = compressLedRuns(same);
  assert.deepEqual([...out], [254, 9, 9, 9, 46, 9, 9, 9]);
});

test('LED : Teensy et Wemos reçoivent une image complète, par sortie et à la bonne place', () => {
  for (const controller of ['TeensyStripController', 'WemosD1MPStripController'] as const) {
    const leds: CabinetLeds = { controller, port: 'COM7', strips: [strip({ name: 'A', output: 1, height: 5, colorOrder: 'RGB' }), strip({ name: 'B', output: 2, height: 3, colorOrder: 'RGB' })] };
    const config = stripSerialConfig(leds);
    const device = new SimulatedStripDevice();
    device.write(new Uint8Array([0]));
    for (const p of stripSetupPackets(config)) {
      device.write(p.bytes);
      if (p.acks) assert.equal(device.read(p.acks)[0], 0x41, `${controller} : accusé`);
    }
    const frame = createLedFrame(leds);
    frame[0]!.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    frame[1]!.fill(77);
    for (const p of stripFramePackets(config, ledWireOutputs(leds, frame))) {
      device.write(p.bytes);
      if (p.acks) assert.equal(device.read(p.acks)[0], 0x41, `${controller} : accusé après image`);
    }
    assert.deepEqual([...device.shownOutput(0, 5)], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], `${controller} : sortie 1`);
    assert.deepEqual([...device.shownOutput(1, 3)], new Array(9).fill(77), `${controller} : sortie 2`);
  }
});

// --- Effets -----------------------------------------------------------------------------------

test('LED : le chenillard avance dans le sens demandé', () => {
  const grid = { width: 1, height: 10, arrangement: 'TopDownLeftRight' as const };
  const lit = (reverse: boolean, ms: number) => {
    const rgb = renderLedEffect({ kind: 'chase', color: LED_RED, tail: 0, ledsPerSecond: 10, reverse }, grid, ms);
    return Array.from({ length: 10 }, (_, k) => rgb[k * 3]! > 0).indexOf(true);
  };
  assert.equal(lit(false, 300), 3);
  assert.equal(lit(true, 300), 6);
});

// --- Pilote -----------------------------------------------------------------------------------

interface DriverModule {
  createLedService(o: Record<string, unknown>): {
    configure(l: CabinetLeds | undefined): void;
    start(): Promise<{ state: string }>;
    stop(): Promise<void>;
    setColor(target: string, color: readonly [number, number, number], layer?: string): void;
    setEffect(target: string, effect: unknown, layer?: string): void;
    blackout(): void;
    step(): Promise<void>;
    gameStarted(): Promise<void>;
    gameEnded(): void;
    status(): { state: string; error?: { code: string; message: string } };
    simulation: { device: SimulatedStripDevice; udp: { universe: number; data: Uint8Array }[] } | undefined;
  };
  LedError: new (code: string, message: string) => Error & { code: string };
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const driver = require(path.resolve(__dirname, '../../../../app/dist/led-live.js')) as DriverModule;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test('LED pilote : une couleur demandée arrive sur le faux contrôleur, dans l’ordre des puces', async () => {
  const svc = driver.createLedService({ simulated: true, manual: true });
  svc.configure(teensy([strip({ name: 'Côté', height: 3, colorOrder: 'GRB' })]));
  await svc.start();
  svc.setColor('Côté', [255, 0, 0], 'test');
  await svc.step();
  assert.deepEqual([...svc.simulation!.device.shownOutput(0, 3)], [0, 255, 0, 0, 255, 0, 0, 255, 0]);
  svc.blackout();
  await svc.step();
  assert.deepEqual([...svc.simulation!.device.shownOutput(0, 3)], new Array(9).fill(0));
  await svc.stop();
  assert.equal(svc.status().state, 'closed');
});

test('LED pilote : la couche d’essai passe devant l’ambiance, et la rend ensuite', async () => {
  const svc = driver.createLedService({ simulated: true, manual: true });
  svc.configure(teensy([strip({ height: 1, colorOrder: 'RGB' })]));
  await svc.start();
  svc.setColor('*', [0, 0, 255], 'ambient');
  svc.setColor('#0', [255, 0, 0], 'test');
  await svc.step();
  assert.deepEqual([...svc.simulation!.device.shownOutput(0, 1)], [255, 0, 0]);
  svc.setEffect('#0', null, 'test');
  await svc.step();
  assert.deepEqual([...svc.simulation!.device.shownOutput(0, 1)], [0, 0, 255]);
  await svc.stop();
});

test('LED pilote : le port est rendu dès qu’une partie se prépare, et ne se rouvre pas pendant', async () => {
  let opened = 0;
  let closed = 0;
  const device = new SimulatedStripDevice();
  const transports = {
    openSerial: async () => {
      opened++;
      return {
        write: async (d: Uint8Array) => device.write(d),
        read: async (n: number) => device.read(n),
        available: async () => device.available,
        flushInput: async () => void device.read(device.available),
        close: async () => void closed++,
      };
    },
    openUdp: async () => ({ send: async () => undefined, close: () => undefined }),
  };
  const svc = driver.createLedService({ transports, manual: true, sleep: async () => undefined, resumeDelayMs: 0 });
  svc.configure(teensy([strip({ height: 2 })]));
  await svc.start();
  assert.equal(opened, 1);
  svc.setColor('*', [255, 255, 255], 'test');
  await svc.step();
  await svc.gameStarted();
  assert.equal(closed, 1, 'port rendu');
  assert.equal(svc.status().state, 'paused-by-game');
  assert.deepEqual([...device.shownOutput(0, 2)], new Array(6).fill(0), 'LED éteintes avant de rendre le port');
  await assert.rejects(() => svc.start(), (e: { code: string }) => e.code === 'game-running');
  assert.equal(opened, 1, 'aucune ouverture pendant la partie');
  svc.gameEnded();
  await wait(40);
  assert.equal(opened, 2, 'liaison rouverte au retour');
  assert.equal(svc.status().state, 'running');
  await svc.stop();
  assert.equal(closed, 2);
});

test('LED pilote : sans liaison voulue, une partie ne rouvre rien', async () => {
  let opened = 0;
  const transports = {
    openSerial: async () => {
      opened++;
      throw new Error('jamais');
    },
    openUdp: async () => ({ send: async () => undefined, close: () => undefined }),
  };
  const svc = driver.createLedService({ transports, manual: true, resumeDelayMs: 0 });
  svc.configure(teensy([strip()]));
  await svc.gameStarted();
  svc.gameEnded();
  await wait(30);
  assert.equal(opened, 0);
  assert.equal(svc.status().state, 'closed');
});

test('LED pilote : un port pris ou absent dit quoi faire', async () => {
  for (const code of ['port-busy', 'port-missing'] as const) {
    const transports = {
      openSerial: async () => {
        throw new driver.LedError(code, `message ${code}`);
      },
      openUdp: async () => ({ send: async () => undefined, close: () => undefined }),
    };
    const svc = driver.createLedService({ transports, manual: true });
    svc.configure(teensy([strip()]));
    await assert.rejects(() => svc.start(), (e: { code: string }) => e.code === code);
    assert.equal(svc.status().state, 'error');
    assert.equal(svc.status().error?.code, code);
  }
});

test('LED pilote : DudesCab et PinscapePico se décrivent dans l’outil de la carte, rien à ouvrir', async () => {
  const svc = driver.createLedService({ simulated: true, manual: true });
  svc.configure({ controller: 'DudesCab', port: '', strips: [strip()] });
  await assert.rejects(() => svc.start(), (e: { code: string }) => e.code === 'on-board');
});

test('LED pilote : sans bande décrite, l’erreur le dit', async () => {
  const svc = driver.createLedService({ simulated: true, manual: true });
  await assert.rejects(() => svc.start(), (e: { code: string }) => e.code === 'not-configured');
});

test('LED pilote : Art-Net envoie sans port et éteint en s’arrêtant', async () => {
  const svc = driver.createLedService({ simulated: true, manual: true });
  svc.configure({ controller: 'ArtNet', port: '', address: '192.168.1.50', universe: 1, strips: [strip({ height: 2, colorOrder: 'RGB' })] });
  await svc.start();
  svc.setColor('*', [10, 20, 30], 'test');
  await svc.step();
  const sent = svc.simulation!.udp;
  assert.deepEqual([...sent[sent.length - 1]!.data.subarray(0, 6)], [10, 20, 30, 10, 20, 30]);
  await svc.stop();
  assert.deepEqual([...sent[sent.length - 1]!.data.subarray(0, 6)], [0, 0, 0, 0, 0, 0], 'tout éteint à l’arrêt');
});
