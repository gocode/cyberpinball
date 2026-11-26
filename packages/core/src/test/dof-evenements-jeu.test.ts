// Effets LED d'une partie sur une table sans ROM (app/src/dof-evenements-jeu.ts) : réglage gardé, écoute posée
// dans controller.vbs (copie d'origine gardée), événements du fichier joués sur un faux contrôleur de LED.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_LED_ANIMATIONS, DOF_TAP_ENV, DOF_TAP_MARK, LED_LEVEL_SCALE, ledLevelGain, type CabinetLeds, type LedStripSpec, type SimulatedStripDevice } from '../index';

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
  startTap(deps: unknown, exe: string, mode?: { kind: 'generique' }, table?: string, about?: { script?: string; color?: string }): { env: Record<string, string>; stop(): void } | undefined;
  gameLedGain(dir: string): number;
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

// 25/11/2026, borne d'essai : luminosité maximale des animations réglée basse, la partie l'ignorait.
test('effets sans ROM : la partie ne dépasse jamais la luminosité maximale des animations LED', () => {
  const { dir } = setup();
  tap.saveEventSettings(dir, { enabled: true, intensity: 100 });
  // Les deux réglages sont des % perçus : le plus bas passe par la courbe des animations (ledLevelGain).
  assert.equal(tap.gameLedGain(dir), ledLevelGain(DEFAULT_LED_ANIMATIONS.brightness), 'luminosité maximale par défaut');
  fs.writeFileSync(path.join(dir, 'led-animations.json'), JSON.stringify({ brightness: 20, scale: LED_LEVEL_SCALE }));
  assert.equal(tap.gameLedGain(dir), ledLevelGain(20));
  tap.saveEventSettings(dir, { enabled: true, intensity: 30 });
  fs.writeFileSync(path.join(dir, 'led-animations.json'), JSON.stringify({ brightness: 100, scale: LED_LEVEL_SCALE }));
  assert.equal(tap.gameLedGain(dir), ledLevelGain(30), 'intensité des événements plus basse : elle compte');
  tap.saveEventSettings(dir, { enabled: true, intensity: 0 });
  assert.equal(tap.gameLedGain(dir), 0, '0 % : rien ne s’allume');
  fs.rmSync(dir, { recursive: true, force: true });
});

// 26/11/2026 : les anciens fichiers avaient une intensité linéaire ; reprise au cran perçu de même lumière.
test('effets sans ROM : une ancienne intensité linéaire est reprise sans surprise', () => {
  const { dir } = setup();
  const file = path.join(dir, 'dof-evenements.json');
  for (const [old, now] of [[30, 60], [50, 80], [70, 90], [100, 100], [0, 0]] as const) {
    fs.writeFileSync(file, JSON.stringify({ enabled: true, intensity: old }));
    assert.equal(tap.loadEventSettings(dir).intensity, now, `${old} % linéaires`);
    assert.ok(Math.abs(ledLevelGain(now) - old / 100) < 0.1, `${old} % : même lumière à un cran près`);
  }
  tap.saveEventSettings(dir, { enabled: true, intensity: 10 });
  assert.equal(tap.loadEventSettings(dir).intensity, 10, 'un fichier écrit depuis : relu tel quel');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('effets sans ROM : bandes de gauche et de droite trouvées par leur nom, sinon toutes', () => {
  assert.equal(tap.zoneTarget(LEDS, 'left'), 'Gauche');
  assert.equal(tap.zoneTarget(LEDS, 'right'), 'Droite');
  assert.equal(tap.zoneTarget({ ...LEDS, strips: [strip('Arrière', 1)] }, 'left'), '*');
});

test('effets sans ROM : flipper, lanceur de la borne et événement lu dans le script, sur le faux contrôleur', async () => {
  const { dir, exe } = setup();
  tap.saveEventSettings(dir, { enabled: true, intensity: 100 });
  // Pleine luminosité : ce test vérifie où vont les effets, pas leur niveau (la courbe a ses propres tests).
  fs.writeFileSync(path.join(dir, 'led-animations.json'), JSON.stringify({ brightness: 100, scale: LED_LEVEL_SCALE }));
  const service = driver.createLedService({ simulated: true, manual: true });
  const tall = (name: string, output: number): LedStripSpec => ({ ...strip(name, output), height: 10 });
  const leds: CabinetLeds = { ...LEDS, strips: [tall('Gauche', 1), tall('Droite', 2)] };
  let press: ((button: string, down: boolean) => void) | undefined;
  let stopped = false;
  const logs: string[] = [];
  const deps = {
    dataDir: dir,
    leds: () => leds,
    service,
    log: (line: string) => logs.push(line),
    watchButtons: (on: (button: string, down: boolean) => void) => {
      press = on;
      return () => (stopped = true);
    },
  };
  const game = tap.startTap(deps, exe, { kind: 'generique' }, '', { script: 'Sub Bumper1_Hit : DOF 107, DOFPulse : End Sub', color: '#ff0000' });
  assert.ok(game, 'écoute posée');
  const ctrl = path.join(dir, 'vpx', 'scripts', 'controller.vbs');
  assert.ok(fs.readFileSync(ctrl, 'latin1').includes(DOF_TAP_MARK));
  assert.equal(fs.readFileSync(`${ctrl}.cyberpinball-avant`, 'latin1'), CONTROLLER, 'copie d’origine gardée');
  const file = game.env[DOF_TAP_ENV]!;
  const shown = async (ms = 80) => {
    await wait(ms);
    await service.step();
    const sum = (o: number) => [...service.simulation!.device.shownOutput(o, 10)].reduce((s, v) => s + v, 0);
    return { left: sum(0), right: sum(1) };
  };
  const ambient = await shown();
  assert.deepEqual(ambient, { left: 0, right: 0 }, 'noir au repos');
  fs.appendFileSync(file, 'E,101,1,1.0\r\n');
  let s = await shown(100);
  assert.ok(s.left > s.right + 100, `flipper gauche : ${JSON.stringify(s)}`);
  fs.appendFileSync(file, 'E,101,0,1.1\r\n');
  s = await shown(500);
  assert.deepEqual(s, ambient, 'relâché : retour à l’ambiance');
  // Lanceur de la borne : la bille part au relâchement, effet à droite.
  press!('plunger', true);
  press!('plunger', false);
  s = await shown(150);
  assert.ok(s.right > s.left + 100, `lanceur : ${JSON.stringify(s)}`);
  await shown(1000);
  // Bumper : rôle lu dans le script (E107), des deux côtés.
  fs.appendFileSync(file, 'E,107,1,2.0\r\n');
  s = await shown(60);
  assert.ok(s.left > ambient.left + 100 && s.right > ambient.right + 100, `bumper : ${JSON.stringify(s)}`);
  game.stop();
  assert.match(logs[0] ?? '', /couleurs #[0-9a-f]{6} .* gain de luminosité 100\.0 %/, 'couleurs et luminosité au journal');
  const summary = logs.at(-1) ?? '';
  assert.match(summary, /fin de partie, 3 événement\(s\) \(.*flipper 1.*\), bandes allumées \d+ % du temps/, summary);
  assert.ok(!/allumées 100 %/.test(summary), 'pas allumées tout le temps');
  assert.equal(stopped, true, 'boutons rendus');
  assert.equal(fs.existsSync(file), false);
  await wait(20);
  fs.rmSync(dir, { recursive: true, force: true });
});
