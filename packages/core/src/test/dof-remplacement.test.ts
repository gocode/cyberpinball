// Remplacement du DOF d'une table (dof-remplacement.ts), 26/11/2026 : une config communautaire qui allume
// toutes les bandes d'une seule couleur (The Matrix). Avec l'option, les bandes suivent exactement le moteur
// « Effets LED sans DOF » de Cyber Pinball, ROM ou pas : bandes et contrôleur en sommeil dans Cabinet.xml
// (libdof n'ouvre pas leur port, aucune sortie LED de DOF active), les autres toys restent à DOF, le moteur
// prend le port, et tout est rendu octet pour octet à la fin.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  dofReplaceOf,
  dofSleepSummary,
  hasDofSleep,
  ledsFromCabinet,
  libdofCabinet,
  planLedWrite,
  readDofSetup,
  refreshDofFallback,
  restoreDofReplacement,
  restoreDofSleep,
  sleepDofStrips,
  withDofReplace,
  type CabinetLeds,
} from '../index';

const APP = path.resolve(__dirname, '../../../../app');
interface ReplaceModule {
  createDofReplace(host: Record<string, unknown>): {
    isOn(table: unknown): boolean;
    beforeGame(table: unknown, listening: boolean): boolean;
    afterGame(): void;
    tableAction(table: unknown, refresh: () => void): { run(): void } | undefined;
  };
}
interface TapModule {
  openTap(exe: string): { file: string; env: Record<string, string> } | undefined;
  startTap(deps: unknown, exe: string, mode?: unknown, table?: string, about?: unknown, options?: unknown): { stop(): void; ownsLeds(): boolean } | undefined;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const replaceModule = require(path.join(APP, 'dist', 'dof-remplacement.js')) as ReplaceModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tap = require(path.join(APP, 'dist', 'dof-evenements-jeu.js')) as TapModule;

const NAMES = ['PF Left', 'PF Right'];
const leds = (): CabinetLeds => ({
  controller: 'TeensyStripController',
  port: 'COM7',
  strips: [
    { name: 'PF Left', output: 1, width: 1, height: 60, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 80, dofOutput: 1 },
    { name: 'PF Right', output: 2, width: 1, height: 60, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 80, dofOutput: 4 },
  ],
});

/** Contacteurs d'un autre contrôleur (Pinscape, LedWizEquivalent 51) : des toys qui ne sont pas des bandes. */
const CONTACTORS = [
  '    <LedWizEquivalent>',
  '      <Name>LedWizEquivalent 51</Name>',
  '      <Outputs>',
  '        <LedWizEquivalentOutput>',
  '          <OutputName>Contactor 1</OutputName>',
  '          <LedWizEquivalentOutputNumber>1</LedWizEquivalentOutputNumber>',
  '        </LedWizEquivalentOutput>',
  '        <LedWizEquivalentOutput>',
  '          <OutputName>Knocker -- B&amp;W</OutputName>',
  '          <LedWizEquivalentOutputNumber>2</LedWizEquivalentOutputNumber>',
  '        </LedWizEquivalentOutput>',
  '      </Outputs>',
  '      <LedWizNumber>51</LedWizNumber>',
  '    </LedWizEquivalent>',
];

/** Borne d'essai : Cabinet.xml écrit par Cyber Pinball (Teensy, deux bandes, LedWizEquivalent 30), les contacteurs ajoutés, le repli 99. */
function cabinetDir(): { dir: string; cabinetFile: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dof-remplacement-'));
  fs.writeFileSync(path.join(dir, 'directoutputconfig30.ini'), '[Colors DOF]\r\nRed=#ff0000ff\r\n[Config DOF]\r\nmm,S9 Red AL0 AT0 AW100 AH100 300,0\r\n');
  for (const f of planLedWrite(dir, leds()).files) fs.writeFileSync(f.file, f.content);
  const cabinetFile = path.join(dir, 'Cabinet.xml');
  const written = fs.readFileSync(cabinetFile, 'utf8');
  const eol = written.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(cabinetFile, written.replace(/([ \t]*<\/Toys>)/, `${CONTACTORS.join(eol)}${eol}$1`));
  refreshDofFallback(readDofSetup(dir), ['mm_109b'], { enabled: true });
  return { dir, cabinetFile };
}

test('Remplacement DOF : choix gardé dans le .info de la table, retiré sans laisser de trace', () => {
  const info = { Info: { Title: 'The Matrix' }, CyberPinball: { vpx: 'autre' } };
  assert.equal(dofReplaceOf(info), false);
  const on = withDofReplace(info, true);
  assert.equal(dofReplaceOf(on), true);
  assert.deepEqual(on.CyberPinball, { vpx: 'autre', dofReplace: true });
  assert.deepEqual(withDofReplace(on, false), info, 'les autres champs restent');
  assert.deepEqual(withDofReplace(withDofReplace({ Info: {} }, true), false), { Info: {} }, 'pas de CyberPinball vide');
});

test('Remplacement DOF : bandes et Teensy en sommeil, aucune sortie LED de DOF active, autres toys gardés, rendu octet pour octet', () => {
  const { dir, cabinetFile } = cabinetDir();
  try {
    const before = fs.readFileSync(cabinetFile, 'utf8');
    const awake = libdofCabinet(before);
    assert.deepEqual(awake.controllers, ['Teensy']);
    assert.deepEqual(awake.strips, NAMES);
    assert.ok(awake.equivalents.find((e) => e.number === 99)?.outputs.length, 'le repli 99 vise les bandes');

    const s = sleepDofStrips(before, NAMES);
    assert.equal(s.refused, undefined);
    assert.deepEqual(s.controllers, [{ type: 'TeensyStripController', name: 'Teensy', port: 'COM7' }]);
    assert.deepEqual(s.strips, NAMES);
    assert.match(dofSleepSummary(s), /^contrôleur Teensy \(TeensyStripController, COM7\), bandes PF Left, PF Right, 4 sortie\(s\) LedWiz \(30:1, 30:4, 99:1, 99:4\)$/);
    // Invariants : libdof ne voit ni le contrôleur (son port reste à Cyber Pinball), ni les bandes, ni une sortie qui les vise.
    const live = libdofCabinet(s.xml);
    assert.deepEqual(live.controllers, [], 'port des bandes jamais ouvert par libdof');
    assert.deepEqual(live.strips, []);
    for (const e of live.equivalents) for (const o of e.outputs) assert.ok(!NAMES.includes(o.name), `LedWizEquivalent ${e.number} vise encore ${o.name}`);
    assert.deepEqual(live.equivalents.find((e) => e.number === 51)?.outputs.map((o) => o.name), ['Contactor 1', 'Knocker -- B&W'], 'les autres toys restent à DOF');
    assert.ok(!/<!--(?:(?!-->)[\s\S])*--(?!>)/.test(s.xml.replace(/<!-- Cyber Pinball/g, '<!-- X')), 'pas de « -- » dans un commentaire');
    // Rendu exact, sommeil idempotent.
    assert.ok(hasDofSleep(s.xml));
    assert.equal(restoreDofSleep(s.xml), before, 'rendu octet pour octet');
    assert.equal(sleepDofStrips(s.xml, NAMES).xml, s.xml, 'idempotent');
    // Cyber Pinball (éditeur des bandes, moteur) lit toujours Cabinet.xml rendu : il trouve le port et les bandes.
    fs.writeFileSync(cabinetFile, s.xml);
    const seen = ledsFromCabinet(readDofSetup(dir).cabinet!)!;
    assert.equal(seen.port, 'COM7');
    assert.deepEqual(seen.strips.map((x) => x.name), NAMES);
    // Partie d'une autre table : le repli rend tout avant de s'écrire.
    refreshDofFallback(readDofSetup(dir), ['mm_109b'], { enabled: true });
    assert.equal(fs.readFileSync(cabinetFile, 'utf8'), before);
    fs.writeFileSync(cabinetFile, s.xml);
    assert.equal(restoreDofReplacement(cabinetFile), true);
    assert.equal(fs.readFileSync(cabinetFile, 'utf8'), before);
    assert.equal(restoreDofReplacement(cabinetFile), false, 'rien à rendre');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Remplacement DOF : refusé (rien en sommeil) si le contrôleur des bandes pilote aussi un autre toy', () => {
  const { dir, cabinetFile } = cabinetDir();
  try {
    const before = fs.readFileSync(cabinetFile, 'utf8');
    const shared = before.replace(/([ \t]*<\/Toys>)/, '    <RGBAToy>\r\n      <Name>Undercab</Name>\r\n      <OutputNameRed>Teensy.01</OutputNameRed>\r\n    </RGBAToy>\r\n$1');
    const s = sleepDofStrips(shared, NAMES);
    assert.match(s.refused ?? '', /RGBAToy "Undercab" also uses Teensy\.01/);
    assert.equal(s.xml, shared, 'rien en sommeil');
    assert.match(sleepDofStrips(before, ['Inconnue']).refused ?? '', /no LedStrip toy named Inconnue/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Remplacement DOF : au lancement, moteur Cyber Pinball actif sur le port des bandes ; fin de partie et option coupée rendent tout', async () => {
  const { dir, cabinetFile } = cabinetDir();
  const vpx = path.join(dir, 'vpx');
  fs.mkdirSync(path.join(vpx, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(vpx, 'scripts', 'controller.vbs'), 'Sub DOF(DOFevent, State)\r\n\tIf B2SOn Then\r\n\tEnd If\r\nEnd Sub\r\n', 'latin1');
  const exe = path.join(vpx, 'VPinballX64.exe');
  try {
    const before = fs.readFileSync(cabinetFile, 'utf8');
    const infoFile = path.join(dir, 'Matrix.info');
    fs.writeFileSync(infoFile, JSON.stringify(withDofReplace({ Info: { Title: 'The Matrix' } }, true)));
    const table = { id: 'matrix', emulator: 'vpx', infoFile };
    const other = { id: 'autre', emulator: 'vpx', infoFile: path.join(dir, 'Autre.info') };
    const logs: string[] = [];
    const replace = replaceModule.createDofReplace({ tablesDir: () => undefined, dof: () => readDofSetup(dir), changed: () => undefined, log: (l: string) => logs.push(l) });

    assert.equal(replace.beforeGame(table, true), true);
    assert.ok(logs.some((l) => /^\[dof\] remplacement : moteur Cyber Pinball actif \/ en sommeil : contrôleur Teensy \(TeensyStripController, COM7\), bandes PF Left, PF Right/.test(l)), logs.join('\n'));
    const live = libdofCabinet(fs.readFileSync(cabinetFile, 'utf8'));
    assert.deepEqual([live.controllers, live.strips], [[], []], 'aucune sortie LED de DOF active');

    // Le moteur « Effets LED sans DOF » prend les bandes (lues dans Cabinet.xml rendu) et garde le port.
    const calls: string[] = [];
    const service = {
      gameStarted: async () => void calls.push('port rendu'),
      gameReleased: () => void calls.push('port repris'),
      configure: (l: CabinetLeds) => void calls.push(`configure ${l.port} ${l.strips.map((s) => s.name).join('+')}`),
      start: async () => void calls.push('start'),
      setFrame: () => undefined,
      blackout: () => undefined,
      stop: async () => undefined,
    };
    const deps = { dataDir: dir, leds: () => ledsFromCabinet(readDofSetup(dir).cabinet!), service, log: () => undefined };
    const opened = tap.openTap(exe);
    assert.ok(opened);
    const game = tap.startTap(deps, exe, { kind: 'generique' }, path.join(dir, 'Matrix.vpx'), {}, { tap: opened, takeBack: true });
    assert.ok(game);
    assert.equal(game.ownsLeds(), true, 'le port des bandes est à Cyber Pinball');
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(calls, ['port rendu', 'port repris', 'configure COM7 PF Left+PF Right', 'start']);
    game.stop();

    // Fin de partie : tout rendu, octet pour octet.
    replace.afterGame();
    assert.equal(fs.readFileSync(cabinetFile, 'utf8'), before);
    // Partie interrompue, puis partie d'une autre table : rendu avant elle.
    assert.equal(replace.beforeGame(table, true), true);
    assert.equal(replace.beforeGame(other, true), false);
    assert.equal(fs.readFileSync(cabinetFile, 'utf8'), before);
    // Option coupée dans « Gérer la table » : rendu tout de suite, plus de remplacement.
    assert.equal(replace.beforeGame(table, true), true);
    replace.tableAction(table, () => undefined)!.run();
    assert.equal(replace.isOn(table), false);
    assert.equal(fs.readFileSync(cabinetFile, 'utf8'), before);
    // Écoute DOF de VPX impossible : la table garde son DOF, le journal dit pourquoi.
    fs.writeFileSync(infoFile, JSON.stringify(withDofReplace({}, true)));
    assert.equal(replace.beforeGame(table, false), false);
    assert.ok(logs.some((l) => /remplacement : impossible \(écoute DOF de VPX non posée\)/.test(l)));
    assert.equal(fs.readFileSync(cabinetFile, 'utf8'), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Le lancement d'une partie (frontend.ts) route une table en remplacement vers le moteur, ROM ou pas.
test('Remplacement DOF : la partie d’une table en remplacement va au moteur Cyber Pinball, pas à DOF', () => {
  const src = fs.readFileSync(path.join(APP, 'src', 'frontend.ts'), 'utf8');
  assert.match(src, /const replaced = ledGame \? dofReplace\.beforeGame\(table, Boolean\(ledTap\)\) : false;/);
  assert.match(src, /const dofMode: DofTapMode \| undefined = replaced \? \{ kind: 'generique' \}/);
  assert.match(src, /if \(replaced\) return void console\.log\(/, 'PinMAME ne reprend pas les bandes en cours de partie');
  assert.match(src, /if \(!replaced && simulated === undefined && !displayMode && !otherVpx && romsOf\(table\)\.length\) refreshRomFallback\(table\);/, 'le repli ne réveille pas les bandes');
});

// Preuve sur la vraie libdof de VPX (poste de développement) : Cabinet.xml en sommeil, elle charge la config
// sans erreur, garde les contacteurs, et ne touche jamais au port du Teensy (COM250, absent).
const REAL_DLL = 'D:/CyberPinball/emulators/vpx/current/plugins/dof/dof64.dll'; // i18n-ignore : chemin du poste de développement
interface RelayModule {
  startDofRelay(job: Record<string, string>, log: (line: string) => void, script?: string): { begin(): void; stop(): void; done: Promise<number | null> };
}
async function libdofLog(sleep: boolean): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const relayModule = require(path.join(APP, 'dist', 'dof-relais.js')) as RelayModule;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-libdof-remplacement-')) + path.sep;
  const config = path.join(base, 'directoutputconfig');
  fs.mkdirSync(config);
  try {
    for (const f of planLedWrite(config, { ...leds(), port: 'COM250' }).files) fs.writeFileSync(f.file, f.content);
    const cabinetFile = path.join(config, 'Cabinet.xml');
    const written = fs.readFileSync(cabinetFile, 'utf8').replace('<AutoConfigEnabled>true', '<AutoConfigEnabled>false');
    fs.writeFileSync(cabinetFile, sleep ? sleepDofStrips(written, NAMES).xml : written);
    fs.writeFileSync(path.join(config, 'GlobalConfig_B2SServer.xml'), `<?xml version="1.0"?>\r\n<GlobalConfig>\r\n<IniFilesPath>${config}</IniFilesPath>\r\n<CabinetConfigFilePattern>${cabinetFile}</CabinetConfigFilePattern>\r\n</GlobalConfig>\r\n`);
    fs.writeFileSync(path.join(config, 'directoutputconfig30.ini'), '[Colors DOF]\r\nYellow=#ffff00ff\r\n[Config DOF]\r\nmbash,S1 Yellow AL0 AT0 AW100 AH100 200,0,0,S2 Yellow AL0 AT0 AW100 AH100 200\r\n');
    const tapFile = path.join(base, 'evenements.txt');
    fs.writeFileSync(tapFile, '');
    const lines: string[] = [];
    const relay = relayModule.startDofRelay({ dll: REAL_DLL, base, table: path.join(base, 'Essai.vpx'), rom: 'mbash', tap: tapFile }, (l) => lines.push(l), path.join(APP, 'dist', 'relais-dof.js'));
    relay.begin();
    for (let i = 0; i < 100 && !lines.some((l) => / prêt\.$/.test(l)); i++) await new Promise((r) => setTimeout(r, 50));
    relay.stop();
    assert.equal(await relay.done, 0, `sortie propre :\n${lines.join('\n')}`);
    return lines.join('\n');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

test('Remplacement DOF : la vraie libdof lit Cabinet.xml en sommeil sans erreur et n’ouvre pas le port des bandes', { skip: !fs.existsSync(REAL_DLL) && 'pas de VPX sur ce poste' }, async () => {
  const awake = await libdofLog(false);
  const asleep = await libdofLog(true);
  assert.match(awake, /Loaded output controller: Teensy/, 'éveillé : libdof charge le Teensy');
  assert.match(asleep, /0 output controller definitions and 2 toy definitions loaded/, 'en sommeil : ni contrôleur ni bandes, les deux LedWizEquivalent restent');
  assert.doesNotMatch(asleep, /COM250|Teensy/i, 'en sommeil : libdof ne voit ni le Teensy ni son port');
  assert.match(asleep, /Config for RomName mbash exists/);
  assert.doesNotMatch(asleep, /could not|exception|invalid|unknown|warning/i);
});
