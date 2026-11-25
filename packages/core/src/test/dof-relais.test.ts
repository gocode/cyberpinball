// DOF des tables originales : le plugin DOF de VPX 10.8 n'initialise libdof qu'avec une ROM, donc une table
// originale (B2S.Server, cGameName) reste éteinte même quand la config DOF a sa ligne. Cyber Pinball lance
// alors un relais (app/src/relais-dof.ts) qui initialise la libdof de VPX avec le nom B2S de la table et lui
// passe les événements que controller.vbs recopie.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { DOF_TAP_ENV, DOF_TAP_MARK, cabinetXml, readDofSetup, refreshDofFallback } from '../index';

type Mode = { kind: 'relais'; rom: string } | { kind: 'generique' } | undefined;
interface Relay {
  begin(): void;
  stop(): void;
  done: Promise<number | null>;
}
interface TapModule {
  saveEventSettings(dir: string, s: Record<string, unknown>): void;
  loadEventSettings(dir: string): Record<string, unknown>;
  tapMode(deps: unknown, table: { hasRom: boolean; b2sName?: string }): Mode;
  tapPlanned(deps: unknown, hasRom: boolean, b2sName?: string): boolean;
  startTap(deps: unknown, exe: string, mode?: Mode, tablePath?: string): { env: Record<string, string>; stop(): void } | undefined;
}
interface RelayModule {
  startDofRelay(job: Record<string, string>, log: (line: string) => void, script?: string): Relay;
}
const APP = path.resolve(__dirname, '../../../../app');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tap = require(path.join(APP, 'dist', 'dof-evenements-jeu.js')) as TapModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const relayModule = require(path.join(APP, 'dist', 'dof-relais.js')) as RelayModule;

const REAL_DLL = 'D:/CyberPinball/emulators/vpx/current/plugins/dof/dof64.dll'; // i18n-ignore : chemin du poste de développement
const CONTROLLER = 'Sub DOF(DOFevent, State)\r\n\tIf B2SOn Then\r\n\tEnd If\r\nEnd Sub\r\n';
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function setup(): { dir: string; exe: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dof-relais-'));
  fs.mkdirSync(path.join(dir, 'vpx', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'vpx', 'plugins', 'dof'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'vpx', 'plugins', 'dof', 'dof64.dll'), '');
  fs.writeFileSync(path.join(dir, 'vpx', 'scripts', 'controller.vbs'), CONTROLLER, 'latin1');
  return { dir, exe: path.join(dir, 'vpx', 'VPinballX64.exe') };
}

const dofWith = (...roms: string[]) => () => ({ base: 'C:\\VPX\\', has: (rom: string) => roms.includes(rom.toLowerCase()) });

test('DOF des tables originales : relais pour une table sans ROM dont la config a la ligne, sinon effets génériques ou rien', () => {
  const { dir } = setup();
  const deps = { dataDir: dir, leds: () => undefined, service: {}, log: () => undefined, dof: dofWith('jpspacecadetge') };
  // Allumé par défaut, sans rien régler, et sans bandes décrites (Pinscape, LedWiz… suffisent).
  assert.deepEqual(tap.tapMode(deps, { hasRom: false, b2sName: 'jpSpaceCadetGE' }), { kind: 'relais', rom: 'jpSpaceCadetGE' });
  assert.equal(tap.tapPlanned(deps, false, 'jpSpaceCadetGE'), false, 'le port des LED est rendu à libdof');
  assert.equal(tap.tapMode(deps, { hasRom: true, b2sName: 'jpSpaceCadetGE' }), undefined, 'table à ROM : le plugin DOF de VPX s’en charge');
  assert.equal(tap.tapMode(deps, { hasRom: false, b2sName: 'Inconnue' }), undefined, 'pas de ligne dans la config');
  assert.equal(tap.tapMode(deps, { hasRom: false }), undefined, 'pas de nom B2S');
  assert.equal(tap.tapMode({ ...deps, dof: () => undefined }, { hasRom: false, b2sName: 'jpSpaceCadetGE' }), undefined, 'pas de config DOF');
  // Coupé par le joueur : la table retombe sur les effets génériques s'ils sont voulus.
  tap.saveEventSettings(dir, { enabled: false, intensity: 70, originals: false });
  assert.equal(tap.loadEventSettings(dir).originals, false);
  assert.equal(tap.tapMode(deps, { hasRom: false, b2sName: 'jpSpaceCadetGE' }), undefined);
  tap.saveEventSettings(dir, { enabled: true, intensity: 70, originals: false });
  const withLeds = { ...deps, leds: () => ({ controller: 'TeensyStripController', port: 'COM7', strips: [{ name: 'Gauche' }] }) };
  assert.deepEqual(tap.tapMode(withLeds, { hasRom: false, b2sName: 'jpSpaceCadetGE' }), { kind: 'generique' });
  // Réglage ancien (sans « originals ») : le relais reste allumé.
  tap.saveEventSettings(dir, { enabled: true, intensity: 50 });
  assert.deepEqual(tap.loadEventSettings(dir), { enabled: true, intensity: 50 });
  assert.deepEqual(tap.tapMode(withLeds, { hasRom: false, b2sName: 'jpSpaceCadetGE' }), { kind: 'relais', rom: 'jpSpaceCadetGE' }, 'la config de la borne passe avant le profil générique');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('DOF des tables originales : écoute posée, port des LED rendu avant que libdof ne s’initialise, relais arrêté en fin de partie', async () => {
  const { dir, exe } = setup();
  const calls: string[] = [];
  const service = {
    gameStarted: async () => {
      calls.push('port rendu');
    },
    configure: () => calls.push('configure'),
    start: async () => calls.push('start'),
  };
  let job: Record<string, string> | undefined;
  const deps = {
    dataDir: dir,
    leds: () => undefined,
    service,
    log: () => undefined,
    dof: dofWith('jpspacecadetge'),
    startRelay: (j: Record<string, string>) => {
      job = j;
      return { begin: () => calls.push('init'), stop: () => calls.push('stop'), done: Promise.resolve(0) };
    },
  };
  const game = tap.startTap(deps, exe, { kind: 'relais', rom: 'jpSpaceCadetGE' }, 'C:\\Tables\\Space Cadet.vpx');
  assert.ok(game);
  assert.ok(fs.readFileSync(path.join(dir, 'vpx', 'scripts', 'controller.vbs'), 'latin1').includes(DOF_TAP_MARK));
  const file = game.env[DOF_TAP_ENV]!;
  assert.ok(fs.existsSync(file));
  assert.deepEqual(job, { dll: path.join(dir, 'vpx', 'plugins', 'dof', 'dof64.dll'), base: 'C:\\VPX\\', table: 'C:\\Tables\\Space Cadet.vpx', rom: 'jpSpaceCadetGE', tap: file });
  await wait(10);
  assert.deepEqual(calls, ['port rendu', 'init'], 'libdof ne s’initialise qu’une fois le port rendu, et le pilote des LED n’est pas rouvert');
  game.stop();
  assert.deepEqual(calls.at(-1), 'stop');
  await wait(10);
  assert.equal(fs.existsSync(file), false, 'fichier effacé une fois le relais sorti');
  // Sans la libdof de VPX : rien n'est lancé.
  fs.rmSync(path.join(dir, 'vpx', 'plugins', 'dof', 'dof64.dll'));
  assert.equal(tap.startTap(deps, exe, { kind: 'relais', rom: 'jpSpaceCadetGE' }, 'C:\\Tables\\Space Cadet.vpx'), undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('DOF des tables originales : le relais charge la vraie libdof, lit la config avec le nom B2S, reçoit les événements et sort', { skip: !fs.existsSync(REAL_DLL) && 'pas de VPX sur ce poste' }, async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-libdof-')) + path.sep;
  const config = path.join(base, 'directoutputconfig');
  fs.mkdirSync(config);
  // Aucun contrôleur, et pas de détection automatique : aucun port n'est ouvert.
  fs.writeFileSync(path.join(config, 'Cabinet.xml'), '<?xml version="1.0"?>\r\n<Cabinet>\r\n<Name>Essai</Name>\r\n<AutoConfigEnabled>false</AutoConfigEnabled>\r\n</Cabinet>\r\n');
  fs.writeFileSync(path.join(config, 'GlobalConfig_B2SServer.xml'), `<?xml version="1.0"?>\r\n<GlobalConfig>\r\n<IniFilesPath>${config}</IniFilesPath>\r\n<CabinetConfigFilePattern>${path.join(config, 'Cabinet.xml')}</CabinetConfigFilePattern>\r\n</GlobalConfig>\r\n`);
  fs.writeFileSync(path.join(config, 'directoutputconfig30.ini'), '[Config DOF]\r\ncyberessai,E101,E102\r\n');
  const tapFile = path.join(base, 'evenements.txt');
  fs.writeFileSync(tapFile, '');
  const lines: string[] = [];
  const relay = relayModule.startDofRelay({ dll: REAL_DLL, base, table: path.join(base, 'Essai.vpx'), rom: 'cyberessai', tap: tapFile }, (l) => lines.push(l), path.join(APP, 'dist', 'relais-dof.js'));
  relay.begin();
  for (let i = 0; i < 100 && !lines.some((l) => / prêt\.$/.test(l)); i++) await wait(50);
  assert.ok(lines.some((l) => / prêt\.$/.test(l)), `libdof initialisée :\n${lines.join('\n')}`);
  assert.ok(lines.some((l) => /romname\W+cyberessai/i.test(l)), `le nom B2S est passé à libdof :\n${lines.join('\n')}`);
  fs.appendFileSync(tapFile, 'E,101,1,1.0\r\nE,101,0,1.1\r\nE,102,2,1.2\r\n');
  await wait(100);
  relay.stop();
  assert.equal(await relay.done, 0, `sortie propre :\n${lines.join('\n')}`);
  fs.rmSync(base, { recursive: true, force: true });
});

test('Repli DOF des tables à ROM : la vraie libdof lit directoutputconfig99.ini et son LedWizEquivalent sans erreur', { skip: !fs.existsSync(REAL_DLL) && 'pas de VPX sur ce poste' }, async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-libdof-')) + path.sep;
  const config = path.join(base, 'directoutputconfig');
  fs.mkdirSync(config);
  const strip = { output: 1, width: 1, height: 60, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 80 } as const;
  const xml = cabinetXml({ controller: 'TeensyStripController', port: 'COM250', strips: [{ ...strip, name: 'PF Left', dofOutput: 1 }, { ...strip, name: 'PF Right', output: 2, dofOutput: 4 }] });
  // Bandes déclarées sans contrôleur : aucun port n'est ouvert.
  fs.writeFileSync(path.join(config, 'Cabinet.xml'), xml.replace(/<OutputControllers>[\s\S]*<\/OutputControllers>/, '<OutputControllers></OutputControllers>').replace('<AutoConfigEnabled>true', '<AutoConfigEnabled>false'));
  fs.writeFileSync(path.join(config, 'GlobalConfig_B2SServer.xml'), `<?xml version="1.0"?>\r\n<GlobalConfig>\r\n<IniFilesPath>${config}</IniFilesPath>\r\n<CabinetConfigFilePattern>${path.join(config, 'Cabinet.xml')}</CabinetConfigFilePattern>\r\n</GlobalConfig>\r\n`);
  fs.writeFileSync(path.join(config, 'directoutputconfig30.ini'), '[Colors DOF]\r\nRed=#ff0000ff\r\n[Config DOF]\r\nmm,S9 Red AL0 AT0 AW100 AH100 300,0\r\n');
  fs.writeFileSync(path.join(config, 'directoutputconfig51.ini'), '[Colors DOF]\r\nRed=#ff0000ff\r\n[Config DOF]\r\nmm,S9,S10,W15,S47|S48,G1\r\n');
  const result = refreshDofFallback(readDofSetup(config), ['mm_109b'], { enabled: true });
  assert.deepEqual(result.plan?.added.map((a) => a.key), ['mm']);
  const tapFile = path.join(base, 'evenements.txt');
  fs.writeFileSync(tapFile, '');
  const lines: string[] = [];
  const relay = relayModule.startDofRelay({ dll: REAL_DLL, base, table: path.join(base, 'Essai.vpx'), rom: 'mm_109b', tap: tapFile }, (l) => lines.push(l), path.join(APP, 'dist', 'relais-dof.js'));
  relay.begin();
  for (let i = 0; i < 100 && !lines.some((l) => / prêt\.$/.test(l)); i++) await wait(50);
  relay.stop();
  assert.equal(await relay.done, 0, `sortie propre :\n${lines.join('\n')}`);
  const log = lines.join('\n');
  assert.match(log, /3 directoutputconfig\.ini or ledcontrol\.ini files loaded/);
  assert.match(log, /directoutputconfig99\.ini/);
  assert.match(log, /Config for RomName mm_109b exists/);
  assert.match(log, /4 toy definitions loaded/, 'deux bandes, LedWizEquivalent 30 et 99');
  assert.doesNotMatch(log, /could not|exception|invalid|unknown|warning/i);
  fs.rmSync(base, { recursive: true, force: true });
});
