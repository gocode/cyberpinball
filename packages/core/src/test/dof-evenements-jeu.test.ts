// Effets LED d'une partie sur une table sans ROM (app/src/dof-evenements-jeu.ts) : réglage gardé, écoute posée
// dans controller.vbs (copie d'origine gardée), événements du fichier joués sur un faux contrôleur de LED.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { DOF_TAP_ENV, DOF_TAP_MARK, type CabinetLeds, type LedStripSpec, type SimulatedStripDevice } from '../index';

interface Service {
  configure(l: CabinetLeds | undefined): void;
  start(): Promise<{ state: string }>;
  step(): Promise<void>;
  status(): { state: string };
  simulation: { device: SimulatedStripDevice } | undefined;
}
interface TapModule {
  loadEventSettings(dir: string): { enabled: boolean; intensity: number };
  saveEventSettings(dir: string, s: { enabled: boolean; intensity: number }): void;
  tapPlanned(deps: unknown, hasRom: boolean): boolean;
  zoneTarget(leds: CabinetLeds, zone: string): string;
  startTap(deps: unknown, exe: string): { env: Record<string, string>; stop(): void } | undefined;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const driver = require(path.resolve(__dirname, '../../../../app/dist/led-live.js')) as { createLedService(o: Record<string, unknown>): Service };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tap = require(path.resolve(__dirname, '../../../../app/dist/dof-evenements-jeu.js')) as TapModule;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const strip = (name: string, output: number): LedStripSpec => ({ name, output, width: 1, height: 2, arrangement: 'TopDownLeftRight', colorOrder: 'RGB', brightness: 100, dofOutput: output });
const LEDS: CabinetLeds = { controller: 'TeensyStripController', port: 'COM7', strips: [strip('Gauche', 1), strip('Droite', 2)] };
const CONTROLLER = 'Sub DOF(DOFevent, State)\r\n\tIf B2SOn Then\r\n\tEnd If\r\nEnd Sub\r\n';

function setup(): { dir: string; exe: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dof-tap-'));
  fs.mkdirSync(path.join(dir, 'vpx', 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'vpx', 'scripts', 'controller.vbs'), CONTROLLER, 'latin1');
  return { dir, exe: path.join(dir, 'vpx', 'VPinballX64.exe') };
}

test('effets sans ROM : réglage coupé par défaut, gardé, et jamais pour une table à ROM', () => {
  const { dir } = setup();
  const deps = { dataDir: dir, leds: () => LEDS, service: {}, log: () => undefined };
  assert.equal(tap.loadEventSettings(dir).enabled, false);
  assert.equal(tap.tapPlanned(deps, false), false);
  tap.saveEventSettings(dir, { enabled: true, intensity: 50 });
  assert.deepEqual(tap.loadEventSettings(dir), { enabled: true, intensity: 50 });
  assert.equal(tap.tapPlanned(deps, false), true);
  assert.equal(tap.tapPlanned(deps, true), false, 'une table à ROM : DOF a le port');
  assert.equal(tap.tapPlanned({ ...deps, leds: () => undefined }, false), false, 'sans bandes décrites');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('effets sans ROM : bandes de gauche et de droite trouvées par leur nom, sinon toutes', () => {
  assert.equal(tap.zoneTarget(LEDS, 'left'), 'Gauche');
  assert.equal(tap.zoneTarget(LEDS, 'right'), 'Droite');
  assert.equal(tap.zoneTarget({ ...LEDS, strips: [strip('Arrière', 1)] }, 'left'), '*');
});

test('effets sans ROM : flipper tenu puis relâché, slingshot en impulsion, sur le faux contrôleur', async () => {
  const { dir, exe } = setup();
  tap.saveEventSettings(dir, { enabled: true, intensity: 100 });
  const service = driver.createLedService({ simulated: true, manual: true });
  const game = tap.startTap({ dataDir: dir, leds: () => LEDS, service, log: () => undefined }, exe);
  assert.ok(game, 'écoute posée');
  const ctrl = path.join(dir, 'vpx', 'scripts', 'controller.vbs');
  assert.ok(fs.readFileSync(ctrl, 'latin1').includes(DOF_TAP_MARK));
  assert.equal(fs.readFileSync(`${ctrl}.cyberpinball-avant`, 'latin1'), CONTROLLER, 'copie d’origine gardée');
  const file = game.env[DOF_TAP_ENV]!;
  const shown = async (output: number) => {
    await wait(80);
    await service.step();
    return [...service.simulation!.device.shownOutput(output, 2)];
  };
  fs.appendFileSync(file, 'E,101,1,1.0\r\n');
  assert.deepEqual(await shown(0), [0, 120, 255, 0, 120, 255]);
  fs.appendFileSync(file, 'E,101,0,1.1\r\nE,104,1,1.2\r\n');
  assert.deepEqual(await shown(0), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...service.simulation!.device.shownOutput(1, 2)], [255, 60, 0, 255, 60, 0]);
  await wait(150);
  assert.deepEqual(await shown(1), [0, 0, 0, 0, 0, 0], 'impulsion éteinte');
  game.stop();
  assert.equal(fs.existsSync(file), false);
  await wait(20);
  fs.rmSync(dir, { recursive: true, force: true });
});
