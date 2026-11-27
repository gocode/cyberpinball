// Effets LED d'une partie sur une table sans ROM (app/src/dof-evenements-jeu.ts) : réglage gardé, écoute posée
// dans controller.vbs (copie d'origine gardée), événements du fichier joués sur un faux contrôleur de LED.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_LED_ANIMATIONS, DOF_TAP_ENV, DOF_TAP_MARK, LED_LEVEL_SCALE, cabinetXml, ledLevelGain, libdofBrightnessFactor, readCabinetXml, type CabinetLeds, type LedStripSpec, type SimulatedStripDevice } from '../index';

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
  tapMode(deps: unknown, table: { hasRom: boolean; b2sName?: string; noDofCalls?: boolean }): { kind: string; rom?: string } | undefined;
  scriptCallsNoDof(script: string | undefined): boolean;
  zoneTarget(leds: CabinetLeds, zone: string): string;
  startTap(deps: unknown, exe: string, mode?: { kind: 'generique' }, table?: string, about?: { script?: string; color?: string }): { env: Record<string, string>; stop(): void } | undefined;
  gameLedGain(dir: string): number;
  capDofLeds(cabinet: { file: string } | undefined, dir: string, log: (line: string) => void): boolean;
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

// 26/11/2026, borne d'essai : intensité à 10 %, les LED d'une partie à ROM (libdof) restaient aveuglantes.
test('table à ROM : le plafond des effets en partie atteint les LED de libdof (10 % : quasi éteint)', () => {
  const { dir } = setup();
  const file = path.join(dir, 'Cabinet.xml');
  const leds: CabinetLeds = { controller: 'TeensyStripController', port: 'COM5', strips: [strip('PF Left', 1), { ...strip('PF Back', 2), width: 32, height: 8, brightness: 60 }] };
  fs.writeFileSync(file, cabinetXml(leds), 'utf8');
  fs.writeFileSync(path.join(dir, 'led-animations.json'), JSON.stringify({ brightness: 100, scale: LED_LEVEL_SCALE }));
  tap.saveEventSettings(dir, { enabled: false, intensity: 10 });
  const lines: string[] = [];
  assert.equal(tap.capDofLeds({ file }, dir, (l) => lines.push(l)), true, 'Cabinet.xml réécrit avant la partie');
  const written = [...fs.readFileSync(file, 'utf8').matchAll(/<Brightness>(\d+)<\/Brightness>/g)].map((m) => Number(m[1]));
  assert.equal(written.length, 2);
  for (const b of written) assert.ok(Math.floor(255 * libdofBrightnessFactor(b)) <= 3, `blanc plein ${Math.floor(255 * libdofBrightnessFactor(b))}/255 à 10 %`);
  assert.match(lines.join('\n'), /PF Left 100 → \d+, PF Back 60 → \d+/);
  // Retour au cran 100 : la description d'origine, et l'éditeur relit toujours la luminosité décrite.
  tap.saveEventSettings(dir, { enabled: false, intensity: 100 });
  assert.equal(tap.capDofLeds({ file }, dir, () => undefined), true);
  assert.deepEqual(readCabinetXml(file).strips.map((s) => s.brightness), [100, 60]);
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /CyberPinballBrightness/);
  assert.equal(tap.capDofLeds(undefined, dir, () => undefined), false, 'pas de Cabinet.xml : rien');
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

// 27/11/2026, Agentic (table originale) : la config DOF de la borne avait une ligne pour son nom (repli), mais son
// script n'appelle jamais DOF : le relais ne recevait rien, « 0 événement relayé », LED muettes. Sans appel DOF
// dans le script, la partie passe aux effets sans ROM (boutons, animation de départ).
test('table originale dont le script n’appelle aucun DOF : effets sans ROM, jamais un relais muet', () => {
  const { dir } = setup();
  tap.saveEventSettings(dir, { enabled: true, intensity: 50 });
  const deps = { dataDir: dir, leds: () => LEDS, service: {}, log: () => undefined, dof: () => ({ base: dir, has: (rom: string) => rom === 'agentic' }) };
  assert.deepEqual(tap.tapMode(deps, { hasRom: false, b2sName: 'agentic' }), { kind: 'relais', rom: 'agentic' }, 'script inconnu ou avec DOF : relais');
  assert.deepEqual(tap.tapMode(deps, { hasRom: false, b2sName: 'agentic', noDofCalls: true }), { kind: 'generique' });
  assert.equal(tap.tapMode({ ...deps, leds: () => undefined }, { hasRom: false, b2sName: 'agentic', noDofCalls: true }), undefined, 'sans bandes décrites : rien');
  assert.equal(tap.scriptCallsNoDof(undefined), false, 'script illisible : on ne sait pas');
  assert.equal(tap.scriptCallsNoDof('Const cGameName = "agentic"\r\nExecuteGlobal CyberPinball_TextFile("controller.vbs")\r\nPlaySoundAtLevelStatic SoundFX("Knocker_1",DOFKnocker), 1, 1\r\n'), true);
  assert.equal(tap.scriptCallsNoDof('Sub Bumper1_Hit : DOF 107, DOFPulse : End Sub'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('effets sans ROM : table sans appel DOF, les sons de la table (slingshot, bumper) allument les bandes ; avec DOF, ils sont ignorés', async () => {
  const { dir, exe } = setup();
  const ctrl = path.join(dir, 'vpx', 'scripts', 'controller.vbs');
  fs.writeFileSync(ctrl, `${CONTROLLER}Function SoundFX (Sound, Effect)\r\n\tSoundFX = Sound\r\nEnd Function\r\n`, 'latin1');
  tap.saveEventSettings(dir, { enabled: true, intensity: 100 });
  fs.writeFileSync(path.join(dir, 'led-animations.json'), JSON.stringify({ brightness: 100, scale: LED_LEVEL_SCALE }));
  const service = driver.createLedService({ simulated: true, manual: true });
  const tall = (name: string, output: number): LedStripSpec => ({ ...strip(name, output), height: 10 });
  const leds: CabinetLeds = { ...LEDS, strips: [tall('Gauche', 1), tall('Droite', 2)] };
  const deps = { dataDir: dir, leds: () => leds, service, log: () => undefined };
  const NO_DOF = 'Const cGameName = "agentic"\r\nExecuteGlobal CyberPinball_TextFile("controller.vbs")\r\nPlaySoundAtLevelStatic SoundFX("Sling_L1",DOFContactors), 1, 1\r\n';
  const game = tap.startTap(deps, exe, { kind: 'generique' }, '', { script: NO_DOF, color: '#ff0000' });
  assert.ok(game, 'écoute posée');
  assert.ok(fs.readFileSync(ctrl, 'latin1').includes('Sub CyberPinball_SoundTap('), 'écoute des sons posée');
  const file = game.env[DOF_TAP_ENV]!;
  const shown = async (ms = 80) => {
    await wait(ms);
    await service.step();
    const sum = (o: number) => [...service.simulation!.device.shownOutput(o, 10)].reduce((s, v) => s + v, 0);
    return { left: sum(0), right: sum(1) };
  };
  await shown(1900);
  const ambient = await shown();
  assert.deepEqual(ambient, { left: 0, right: 0 }, 'noir au repos');
  // Son de flipper (jouet 7) et bruit sans rôle : rien.
  fs.appendFileSync(file, 'S,7,Flipper_L01,1.0\r\nS,1,Ball_Rolling,1.1\r\n');
  assert.deepEqual(await shown(150), ambient, 'flipper et bruit : pas d’effet');
  // Slingshot gauche : effet à gauche.
  fs.appendFileSync(file, 'S,1,Sling_L3,2.0\r\n');
  const sling = await shown(80);
  assert.ok(sling.left > sling.right + 100, `slingshot gauche : ${JSON.stringify(sling)}`);
  await shown(1200);
  // Bumper : au centre, donc des deux côtés.
  fs.appendFileSync(file, 'S,1,Bumpers_Top_2,3.0\r\n');
  const bump = await shown(60);
  assert.ok(bump.left > 100 && bump.right > 100, `bumper : ${JSON.stringify(bump)}`);
  game.stop();

  // 27/11/2026, Apollo 13 : un script qui n'appelle DOF que pour une partie des événements (ici le bumper) garde
  // les sons de tout le reste ; le son du bumper joué avec son appel DOF ne double pas l'effet.
  // Le pilote de la partie précédente finit de s'arrêter avant la suivante.
  await wait(300);
  const logs: string[] = [];
  const other = tap.startTap({ ...deps, log: (line: string) => logs.push(line) }, exe, { kind: 'generique' }, '', { script: 'Sub Bumper1_Hit : DOF 107, DOFPulse : End Sub', color: '#ff0000' });
  assert.ok(other);
  await shown(1900);
  fs.appendFileSync(other.env[DOF_TAP_ENV]!, 'S,1,Sling_L3,2.0\r\n');
  const withDof = await shown(80);
  assert.ok(withDof.left > withDof.right + 100, `script avec DOF : le son du slingshot allume quand même : ${JSON.stringify(withDof)}`);
  await shown(1200);
  fs.appendFileSync(other.env[DOF_TAP_ENV]!, 'E,107,1,5.0\r\nS,1,Bumpers_Top_2,5.01\r\nE,107,0,5.02\r\n');
  await shown(150);
  other.stop();
  const summary = logs.find((l) => l.includes('fin de partie')) ?? '';
  assert.match(summary, /bumper 1\b/, `appel DOF et son du même bumper : un seul effet (${summary})`);
  assert.match(summary, /1 appel\(s\) DOF, 0 bobine\(s\) PinMAME, 1 son\(s\)/, summary);
  await wait(20);
  fs.rmSync(dir, { recursive: true, force: true });
});

// 27/11/2026, Apollo 13 (table à ROM, effets de Cyber Pinball à la place de DOF) : seuls les flippers s'allumaient.
test('effets de Cyber Pinball sur une table à ROM : les bobines de PinMAME allument les bandes', async () => {
  const { dir, exe } = setup();
  const core = path.join(dir, 'vpx', 'scripts', 'core.vbs');
  fs.writeFileSync(core, 'Sub PinMAMETimer_Timer\r\n\tFor ii = 0 To UBound(ChgSol)\r\n\tNext\r\nEnd Sub\r\n', 'latin1');
  tap.saveEventSettings(dir, { enabled: true, intensity: 100 });
  fs.writeFileSync(path.join(dir, 'led-animations.json'), JSON.stringify({ brightness: 100, scale: LED_LEVEL_SCALE }));
  const service = driver.createLedService({ simulated: true, manual: true });
  const tall = (name: string, output: number): LedStripSpec => ({ ...strip(name, output), height: 10 });
  const leds: CabinetLeds = { ...LEDS, strips: [tall('Gauche', 1), tall('Droite', 2)] };
  const logs: string[] = [];
  const deps = { dataDir: dir, leds: () => leds, service, log: (line: string) => logs.push(line) };
  const SCRIPT = 'SolCallback(3) = "SolRightEject"\r\nSolCallback(15) = "SolLFlipperd"\r\nSolCallback(25) = "SolFLamp1"\r\nPlaySound SoundFXDOF("",101,DOFOn,DOFFlippers)\r\n';
  const game = tap.startTap(deps, exe, { kind: 'generique' }, '', { script: SCRIPT, color: '#ff0000' });
  assert.ok(game, 'écoute posée');
  assert.ok(fs.readFileSync(core, 'latin1').includes('CyberPinball_SolTap ChgSol(ii, 0), ChgSol(ii, 1)'), 'écoute des bobines posée dans core.vbs');
  assert.ok(fs.existsSync(core + '.cyberpinball-avant'), 'copie d’origine de core.vbs gardée');
  const sol = game.env[DOF_TAP_ENV]! + '.pinmame';
  const shown = async (ms = 80) => {
    await wait(ms);
    await service.step();
    const sum = (o: number) => [...service.simulation!.device.shownOutput(o, 10)].reduce((s, v) => s + v, 0);
    return { left: sum(0), right: sum(1) };
  };
  await shown(1900);
  assert.deepEqual(await shown(), { left: 0, right: 0 }, 'noir au repos');
  // Bobine du flipper (les boutons le montrent déjà) et bobine sans callback : rien.
  fs.appendFileSync(sol, 'P,15,1,1.0\r\nP,15,0,1.05\r\nP,40,1,1.1\r\n');
  assert.deepEqual(await shown(150), { left: 0, right: 0 }, 'flipper et bobine inconnue : pas d’effet');
  // Éjection à droite.
  fs.appendFileSync(sol, 'P,3,1,2.0\r\nP,3,0,2.05\r\n');
  const eject = await shown(80);
  assert.ok(eject.right > eject.left + 100, `éjection à droite : ${JSON.stringify(eject)}`);
  await shown(1500);
  // Flasher : allumé tant que la bobine est alimentée, éteint après.
  fs.appendFileSync(sol, 'P,25,1,4.0\r\n');
  await shown(80);
  const on = await shown(300);
  assert.ok(on.left > 100 && on.right > 100, `flasher tenu : ${JSON.stringify(on)}`);
  fs.appendFileSync(sol, 'P,25,0,4.5\r\n');
  await shown(400);
  assert.deepEqual(await shown(), { left: 0, right: 0 }, 'flasher éteint');
  game.stop();
  assert.ok(logs.some((l) => /3 bobine\(s\) PinMAME dont 3 reconnue\(s\)/.test(l)), logs.join('\n'));
  assert.ok(logs.some((l) => /2 bobine\(s\) PinMAME/.test(l) && l.includes('fin de partie')), logs.join('\n'));
  assert.ok(!fs.existsSync(sol), 'fichier des bobines effacé');
  await wait(20);
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
  // Animation de départ à l'ouverture, avant tout bouton ou événement ; puis retour au noir.
  const started = await shown(150);
  assert.ok(started.left + started.right > 100, `animation de départ : ${JSON.stringify(started)}`);
  await shown(1800);
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
