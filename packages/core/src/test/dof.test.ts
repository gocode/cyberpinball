// DOF (dof.ts) : contrôleurs reconnus à leurs identifiants USB sans rien ouvrir, dossier de
// configuration lu comme libdof le lit, ROM retrouvées avec ses trois règles, constats qui disent
// pourquoi une LED ne s'allume pas, et Cabinet.xml des bandes de LED adressables.
//
// Cas réel (04/11/2026) : une KL25Z Pinscape et des bandes WS2812 branchées dessus qui
// « n'ont jamais fonctionné » : la KL25Z ne pilote pas de LED adressables (il faut un Teensy, un
// Wemos D1…), et [Plugin.DOF] Enable n'était jamais écrit.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  cabinetJoystickHids,
  cabinetXml,
  detectDofControllers,
  dofFindings,
  dofIniNumber,
  dofIniRoms,
  dofRomNumbers,
  DOF_CONTROLLER_TYPES,
  DOF_CONTROLLERS,
  ledProblems,
  ledsFromCabinet,
  ledsPerOutput,
  nextDofOutput,
  parseXml,
  planDofImport,
  planLedWrite,
  readCabinetXml,
  readDofSetup,
  sdlJoystickUsbIds,
  serialPortCandidates,
  stripFirstLeds,
  tableIniMasksGlobal,
  vpxDofSettings,
  wledLedCount,
  wledSegments,
  type CabinetLeds,
} from '../dof';
import { toPhysicalScreen } from '../fingerprint';
import type { ObservedUsbDevice } from '../model';
import { planVpxSync } from '../sync';
import { devPcDisplays, emptyCabinet } from './fixtures';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dof-'));
}

const usb = (vid: number, pid: number, extra: Partial<ObservedUsbDevice> = {}): ObservedUsbDevice => ({
  instanceId: `USB\\VID_${vid.toString(16).toUpperCase().padStart(4, '0')}&PID_${pid.toString(16).toUpperCase().padStart(4, '0')}\\1`,
  vid,
  pid,
  ...extra,
});

const INI = ['[version]', 'version=1', '[Colors DOF]', 'Red=#ff0000ff', '[Config DOF]', 'afm_113b,S11 Red,0,0', 'mm_109c,0,W48,0', 'tz,0,0,S7', '# commentaire', '', '[Variables DOF]', 'x=y'].join('\r\n');

test('DOF : chaque type de contrôleur de libdof a sa fiche', () => {
  for (const type of DOF_CONTROLLER_TYPES) assert.ok(DOF_CONTROLLERS[type].label, type);
  assert.equal(DOF_CONTROLLERS.TeensyStripController.auto, false, 'le Teensy doit être déclaré dans Cabinet.xml');
  assert.equal(DOF_CONTROLLERS.Pinscape.addressable, false, 'la KL25Z ne pilote pas de LED adressables');
});

test('DOF : contrôleurs reconnus à leurs identifiants USB', () => {
  const devices = [
    usb(0xfafa, 0x00f0), // Pinscape ou LedWiz, unité 1
    usb(0x1209, 0xeaea), // Pinscape natif
    usb(0x2e8a, 0x106f), // DudesCab
    usb(0xd209, 0x1402), // PacLed64 n°2
    usb(0xd209, 0x1500), // PacDrive
    usb(0xd209, 0x0411), // UIO
    usb(0x16c0, 0x0483, { port: 'COM7', name: 'USB Serial Device (COM7)' }), // Teensy
    usb(0x046d, 0xc077), // souris : rien
  ];
  const found = detectDofControllers(devices);
  const by = (type: string) => found.filter((f) => f.type === type);
  assert.deepEqual(by('LedWiz')[0]!.numbers, [1, 51], 'FAFA:00F0 : LedWiz 1 ou Pinscape 51');
  assert.equal(by('LedWiz')[0]!.certain, false);
  assert.deepEqual(by('Pinscape')[0]!.numbers, [51]);
  assert.equal(by('Pinscape')[0]!.unitAssumed, true);
  assert.deepEqual(by('DudesCab')[0]!.numbers, [90]);
  assert.deepEqual(by('PacLed64')[0]!.numbers, [21]);
  assert.deepEqual(by('PacDrive')[0]!.numbers, [19]);
  assert.deepEqual(by('PacUIO')[0]!.numbers, [28]);
  assert.equal(by('TeensyStripController')[0]!.device.port, 'COM7');
  assert.equal(found.length, 7);
});

test('DOF : le nom du joystick (SDL) départage Pinscape et LedWiz', () => {
  const found = detectDofControllers([usb(0xfafa, 0x00f7)], [{ vid: 0xfafa, pid: 0x00f7, name: 'Pinscape Controller' }]);
  assert.equal(found[0]!.type, 'Pinscape');
  assert.deepEqual(found[0]!.numbers, [58], 'unité 8 (PID 00F7) → 58');
  assert.equal(found[0]!.certain, true);
});

test('DOF : un périphérique composite compte une fois, avec le port de son interface', () => {
  const found = detectDofControllers([usb(0x16c0, 0x0483), usb(0x16c0, 0x0483, { instanceId: 'USB\\VID_16C0&PID_0483&MI_00\\2', port: 'COM9' })]);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.device.port, 'COM9');
});

test('DOF : identifiants USB tirés du GUID de SDL', () => {
  // GUID SDL : bus 0x0003 (USB), CRC, fabricant FAFA, produit 00F7, version.
  assert.deepEqual(sdlJoystickUsbIds('SDLJoy_03000000fafa0000f700000000000000_1'), { vid: 0xfafa, pid: 0x00f7 });
  assert.equal(sdlJoystickUsbIds('Key;23'), undefined);
});

test('DOF : ports série proposés pour un Wemos, dans l’ordre', () => {
  const ports = serialPortCandidates([usb(0x1a86, 0x7523, { port: 'COM12' }), usb(0x10c4, 0xea60, { port: 'COM3' }), usb(0x046d, 0xc077)]);
  assert.deepEqual(
    ports.map((p) => p.port),
    ['COM3', 'COM12'],
  );
});

test('DOF : noms des ini et ROM de [Config DOF]', () => {
  assert.equal(dofIniNumber('directoutputconfig51.ini'), 51);
  assert.equal(dofIniNumber('DirectOutputConfig.ini'), 1);
  assert.equal(dofIniNumber('ledcontrol3.ini'), 3);
  assert.equal(dofIniNumber('directoutputconfig51.bak'), undefined);
  assert.equal(dofIniNumber('directoutputconfig-old.ini'), undefined);
  assert.deepEqual(dofIniRoms(INI), ['afm_113b', 'mm_109c', 'tz']);
});

test('DOF : les trois règles de libdof pour retrouver une ROM', () => {
  const ini = [
    { number: 51, file: 'a', roms: ['afm_113b', 'tz'] },
    { number: 30, file: 'b', roms: ['AFM_113B', 'mm'] },
  ];
  assert.deepEqual(dofRomNumbers(ini, 'afm_113b'), [51, 30], 'égalité sans casse, dans tous les ini');
  assert.deepEqual(dofRomNumbers(ini, 'tz_94h'), [51], '« tz_… »');
  assert.deepEqual(dofRomNumbers(ini, 'mm_109c'), [30], '« mm_… »');
  assert.deepEqual(dofRomNumbers(ini, 'mmx'), [30], 'préfixe, avec casse');
  assert.deepEqual(dofRomNumbers(ini, 'MMX'), [], 'le préfixe tient compte de la casse');
  assert.deepEqual(dofRomNumbers(ini, 'ij_l7'), []);
});

test('DOF : XML simple, commentaires et entités', () => {
  const doc = parseXml('<?xml version="1.0"?><!-- x --><A b="1"><C>t &amp; u</C><D/></A>');
  const a = doc.children[0]!;
  assert.equal(a.attrs.b, '1');
  assert.equal(a.children[0]!.text, 't & u');
  assert.throws(() => parseXml('<A><B></A>'));
});

function teensyLeds(): CabinetLeds {
  return {
    controller: 'TeensyStripController',
    port: 'COM7',
    strips: [
      { name: 'PF Left', output: 1, width: 1, height: 60, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 80, dofOutput: 1 },
      { name: 'PF Right', output: 2, width: 1, height: 60, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 80, dofOutput: 4 },
      { name: 'PF Back', output: 1, width: 32, height: 8, arrangement: 'LeftRightAlternateTopDown', colorOrder: 'GRB', brightness: 50, dofOutput: 7 },
    ],
  };
}

test('DOF : numérotation des LED d’un bout à l’autre du contrôleur', () => {
  const leds = teensyLeds();
  assert.deepEqual(ledsPerOutput(leds), [60 + 256, 60]);
  assert.deepEqual(stripFirstLeds(leds), [1, 317, 61], 'sortie 1 : PF Left puis PF Back chaînée ; sortie 2 après les 316 LED de la sortie 1');
  assert.equal(nextDofOutput(leds.strips), 10);
  assert.deepEqual(ledProblems(leds), []);
  assert.ok(ledProblems({ ...leds, port: '' }).length);
  assert.ok(ledProblems({ ...leds, strips: [...leds.strips, { ...leds.strips[0]! }] }).some((p) => p.includes('PF Left')));
});

test('DOF : Cabinet.xml écrit puis relu par le même lecteur que libdof', () => {
  const leds = teensyLeds();
  const xml = cabinetXml(leds, new Date('2026-11-05T10:00:00Z'));
  const dir = tmp();
  const file = path.join(dir, 'Cabinet.xml');
  fs.writeFileSync(file, xml);
  const cab = readCabinetXml(file);
  assert.equal(cab.owned, true);
  assert.equal(cab.autoConfig, true, 'les autres contrôleurs restent auto-configurés');
  assert.deepEqual(cab.controllers, [{ type: 'TeensyStripController', name: 'Teensy', comPort: 'COM7', ledsPerOutput: [316, 60] }]);
  assert.deepEqual(
    cab.strips.map((s) => [s.name, s.width, s.height, s.firstLed, s.controller]),
    [
      ['PF Left', 1, 60, 1, 'Teensy'],
      ['PF Right', 1, 60, 317, 'Teensy'],
      ['PF Back', 32, 8, 61, 'Teensy'],
    ],
  );
  assert.deepEqual(cab.equivalents, [
    {
      name: 'LedWizEquivalent 30',
      number: 30,
      outputs: [
        { number: 1, name: 'PF Left' },
        { number: 4, name: 'PF Right' },
        { number: 7, name: 'PF Back' },
      ],
    },
  ]);
  // Relu dans l'éditeur : même description.
  const back = ledsFromCabinet(cab)!;
  assert.deepEqual(back, { controller: leds.controller, port: leds.port, strips: leds.strips });
});

test('DOF : dossier lu comme libdof (GlobalConfig, IniFilesPath, Cabinet.xml)', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'directoutputconfig51.ini'), INI);
  fs.writeFileSync(path.join(dir, 'directoutputconfig30.ini'), INI);
  fs.writeFileSync(path.join(dir, 'ledcontrol.ini'), INI); // ignoré : directoutputconfig passe avant
  let setup = readDofSetup(dir);
  assert.deepEqual(
    setup.ini.map((f) => f.number),
    [30, 51],
  );
  assert.equal(setup.globalConfig, undefined);
  // Un Cabinet.xml sans GlobalConfig qui le désigne n'est pas lu.
  fs.writeFileSync(path.join(dir, 'Cabinet.xml'), cabinetXml(teensyLeds()));
  setup = readDofSetup(dir);
  assert.equal(setup.cabinet, undefined);
  assert.ok(setup.ignoredCabinet);
  // Le GlobalConfig de Cyber Pinball le désigne.
  for (const f of planLedWrite(dir, teensyLeds()).files) fs.writeFileSync(f.file, f.content);
  setup = readDofSetup(dir);
  assert.equal(setup.globalConfig?.owned, true);
  assert.equal(setup.cabinet?.controllers[0]?.type, 'TeensyStripController');
  assert.equal(setup.ignoredCabinet, undefined);
  // IniFilesPath vers un autre dossier : ses ini passent avant.
  const other = tmp();
  fs.writeFileSync(path.join(other, 'directoutputconfig8.ini'), INI);
  fs.writeFileSync(path.join(dir, 'GlobalConfig_B2SServer.xml'), `<GlobalConfig><IniFilesPath>${other}</IniFilesPath></GlobalConfig>`);
  setup = readDofSetup(dir);
  assert.equal(setup.iniDir, other);
  assert.deepEqual(
    setup.ini.map((f) => f.number),
    [8],
  );
  assert.equal(setup.globalConfig?.owned, false);
});

test('DOF : un fichier écrit à la main n’est jamais remplacé', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'Cabinet.xml'), '<Cabinet><Name>Le mien</Name></Cabinet>');
  const plan = planLedWrite(dir, teensyLeds());
  assert.deepEqual(
    plan.files.map((f) => path.basename(f.file)),
    ['GlobalConfig_B2SServer.xml'],
  );
  assert.equal(path.basename(plan.refused[0]!.file), 'Cabinet.xml');
  // GlobalConfig à la main sans CabinetConfigFilePattern : refusé aussi, rien n'est écrit dessus.
  fs.rmSync(path.join(dir, 'Cabinet.xml'));
  fs.writeFileSync(path.join(dir, 'GlobalConfig_B2SServer.xml'), '<GlobalConfig><EnableLogging>true</EnableLogging></GlobalConfig>');
  const plan2 = planLedWrite(dir, teensyLeds());
  assert.deepEqual(
    plan2.files.map((f) => path.basename(f.file)),
    ['Cabinet.xml'],
  );
  assert.equal(path.basename(plan2.refused[0]!.file), 'GlobalConfig_B2SServer.xml');
  // GlobalConfig à la main qui désigne un Cabinet.xml ailleurs : on écrit là où il pointe.
  fs.writeFileSync(path.join(dir, 'GlobalConfig_B2SServer.xml'), '<GlobalConfig><CabinetConfigFilePattern>{GlobalConfigDir}\\leds\\cab.xml</CabinetConfigFilePattern></GlobalConfig>');
  const plan3 = planLedWrite(dir, teensyLeds());
  assert.deepEqual(
    plan3.files.map((f) => path.relative(dir, f.file)),
    [path.join('leds', 'cab.xml')],
  );
});

test('DOF : constats, du cas réel au cas réglé', () => {
  const dir = tmp();
  const kl25z = usb(0x1209, 0xeaea);
  const teensy = usb(0x16c0, 0x0483, { port: 'COM7' });
  // Rien de configuré, une KL25Z seule : il manque les ini.
  let devices = [kl25z];
  let setup = readDofSetup(dir);
  let codes = dofFindings(setup, detectDofControllers(devices), devices).map((f) => f.code);
  assert.deepEqual(codes, ['noIni']);
  // Le configtool importé, un Teensy branché mais non déclaré.
  fs.writeFileSync(path.join(dir, 'directoutputconfig51.ini'), INI);
  devices = [kl25z, teensy];
  setup = readDofSetup(dir);
  codes = dofFindings(setup, detectDofControllers(devices), devices).map((f) => f.code);
  assert.deepEqual(codes, ['addressableUndeclared']);
  // Bandes décrites, mais le configtool n'a pas encore de numéro 30.
  for (const f of planLedWrite(dir, teensyLeds()).files) fs.writeFileSync(f.file, f.content);
  setup = readDofSetup(dir);
  codes = dofFindings(setup, detectDofControllers(devices), devices).map((f) => f.code);
  assert.deepEqual(codes, ['equivalentWithoutIni']);
  // Configtool complet : plus rien à dire.
  fs.writeFileSync(path.join(dir, 'directoutputconfig30.ini'), INI);
  setup = readDofSetup(dir);
  assert.deepEqual(dofFindings(setup, detectDofControllers(devices), devices), []);
  // Teensy débranché : son port manque.
  devices = [kl25z, usb(0x1a86, 0x7523, { port: 'COM3' })];
  codes = dofFindings(setup, detectDofControllers(devices), devices).map((f) => f.code);
  assert.deepEqual(codes, ['cabinetPortMissing'], 'le 30 reste celui du Cabinet.xml, même Teensy débranché');
});

test('DOF : contrôleur inconnu de libdof et bande que rien ne vise', () => {
  const dir = tmp();
  const file = path.join(dir, 'Cabinet.xml');
  fs.writeFileSync(
    file,
    '<Cabinet><OutputControllers><SSFImpactController><Name>SSF</Name></SSFImpactController></OutputControllers><Toys><LedStrip><Name>Seule</Name><Width>1</Width><Height>10</Height></LedStrip></Toys></Cabinet>',
  );
  fs.writeFileSync(path.join(dir, 'GlobalConfig_B2SServer.xml'), '<GlobalConfig><CabinetConfigFilePattern>{GlobalConfigDir}\\Cabinet.xml</CabinetConfigFilePattern></GlobalConfig>');
  const setup = readDofSetup(dir);
  const codes = dofFindings(setup, [], []).map((f) => f.code);
  assert.ok(codes.includes('unknownControllerType'));
  assert.ok(codes.includes('stripUnmapped'));
});

test('DOF : sans contrôleur ni configuration, rien n’est dit d’alarmant et le plugin n’est pas touché', () => {
  const setup = readDofSetup(tmp());
  const findings = dofFindings(setup, [], []);
  assert.deepEqual(
    findings.map((f) => [f.code, f.severity]),
    [['noController', 'info']],
  );
  assert.deepEqual(vpxDofSettings(setup, []), []);
});

test('DOF : ini dans le dossier d’une table, qui masque ceux de la borne', () => {
  const global = tmp();
  const table = tmp();
  fs.writeFileSync(path.join(global, 'directoutputconfig51.ini'), INI);
  fs.writeFileSync(path.join(table, 'directoutputconfig51.ini'), INI);
  assert.equal(tableIniMasksGlobal(readDofSetup(global), table), true);
  // IniFilesPath réglé : il passe avant le dossier de la table.
  fs.writeFileSync(path.join(global, 'GlobalConfig_B2SServer.xml'), `<GlobalConfig><IniFilesPath>${global}</IniFilesPath></GlobalConfig>`);
  assert.equal(tableIniMasksGlobal(readDofSetup(global), table), false);
});

test('DOF : [Plugin.DOF] Enable écrit par la synchronisation, et gardé si on le change à la main', () => {
  const displays = devPcDisplays();
  const cabinet = emptyCabinet();
  cabinet.screens = displays.map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint };
  const devices = [usb(0x1209, 0xeaea)];
  const plan = planVpxSync(cabinet, displays, '', undefined, { usb: devices });
  assert.ok(plan.nextIni?.includes('[Plugin.DOF]'));
  assert.match(plan.nextIni!, /Enable = 1/);
  assert.equal(plan.memory['Plugin.DOF.Enable'], '1');
  assert.equal(plan.dof[0]!.type, 'Pinscape');
  // Sans contrôleur : la clé n'est pas touchée, la mémoire garde la dernière valeur écrite.
  const plain = planVpxSync(cabinet, displays, plan.nextIni!, undefined, { usb: [], memory: plan.memory });
  assert.equal(plain.memory['Plugin.DOF.Enable'], '1');
  assert.ok(!plain.changes.some((c) => c.section === 'Plugin.DOF'));
  // Éteint à la main avec un contrôleur branché : signalé, jamais écrasé en silence.
  const off = plan.nextIni!.replace(/(\[Plugin\.DOF\][^[]*Enable = )1/, '$10');
  const again = planVpxSync(cabinet, displays, off, undefined, { usb: devices, memory: plan.memory });
  assert.ok(again.manualEdits.some((e) => e.section === 'Plugin.DOF'));
});

test('DOF : un FAFA:00Fx relevé comme joystick est un Pinscape (un LedWiz n’est jamais un joystick)', () => {
  const cabinet = { buttons: { leftFlipper: 'SDLJoy_03000000fafa0000f700000000000000_1;3' } };
  const hids = cabinetJoystickHids(cabinet);
  assert.deepEqual(hids, [{ vid: 0xfafa, pid: 0x00f7, name: 'Pinscape (joystick)' }]);
  assert.equal(detectDofControllers([usb(0xfafa, 0x00f7)], hids)[0]!.type, 'Pinscape');
});

test('DOF : import du ZIP du configtool, qui remplace toute la configuration précédente', () => {
  const unpacked = tmp();
  fs.mkdirSync(path.join(unpacked, 'sous'));
  fs.writeFileSync(path.join(unpacked, 'directoutputconfig51.ini'), INI);
  fs.writeFileSync(path.join(unpacked, 'sous', 'directoutputconfig30.ini'), INI);
  fs.writeFileSync(path.join(unpacked, 'tablemappings.xml'), '<x/>');
  fs.writeFileSync(path.join(unpacked, 'Cabinet.xml'), '<Cabinet/>');
  fs.writeFileSync(path.join(unpacked, 'lisezmoi.txt'), 'x');
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'directoutputconfig8.ini'), INI); // ancien contrôleur
  fs.writeFileSync(path.join(dir, 'Cabinet.xml'), '<Cabinet><Name>Le mien</Name></Cabinet>');
  const plan = planDofImport(unpacked, dir);
  assert.deepEqual(plan.numbers, [30, 51]);
  assert.deepEqual(plan.copies.map((c) => path.basename(c.to)).sort(), ['directoutputconfig30.ini', 'directoutputconfig51.ini', 'tablemappings.xml']);
  assert.deepEqual(plan.replaced.map((f) => path.basename(f)), ['directoutputconfig8.ini']);
  assert.ok(plan.skipped.some((s) => path.basename(s.file) === 'Cabinet.xml'), 'Cabinet.xml existant gardé');
  assert.throws(() => planDofImport(tmp(), dir), /directoutputconfig/);
});

test('DOF : la borne de référence (05/11/2026), deux bandes verticales et deux anneaux de haut-parleurs', () => {
  // Deux bandes de plus de 100 LED de part et d'autre du playfield, deux anneaux autour des
  // haut-parleurs du fronton, chacun sur sa sortie de l'OctoWS2811 ; câble de données long vers le fronton.
  const leds: CabinetLeds = {
    controller: 'TeensyStripController',
    port: 'COM5',
    strips: [
      { name: 'Côté gauche', output: 1, width: 1, height: 110, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 100, dofOutput: 1 },
      { name: 'Côté droit', output: 2, width: 1, height: 130, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 100, dofOutput: 4 },
      { name: 'Haut-parleur gauche', output: 3, width: 24, height: 1, arrangement: 'LeftRightTopDown', colorOrder: 'GRB', brightness: 60, dofOutput: 7 },
      { name: 'Haut-parleur droit', output: 4, width: 24, height: 1, arrangement: 'LeftRightTopDown', colorOrder: 'GRB', brightness: 60, dofOutput: 10 },
    ],
  };
  assert.deepEqual(ledProblems(leds), []);
  assert.deepEqual(ledsPerOutput(leds), [110, 130, 24, 24]);
  assert.deepEqual(stripFirstLeds(leds), [1, 111, 241, 265], 'numérotation continue d’une sortie à l’autre');
  const dir = tmp();
  for (const f of planLedWrite(dir, leds).files) fs.writeFileSync(f.file, f.content);
  const cab = readCabinetXml(path.join(dir, 'Cabinet.xml'));
  assert.deepEqual(cab.controllers[0]!.ledsPerOutput, [110, 130, 24, 24]);
  assert.deepEqual(
    cab.strips.map((s) => [s.name, s.firstLed]),
    [
      ['Côté gauche', 1],
      ['Côté droit', 111],
      ['Haut-parleur gauche', 241],
      ['Haut-parleur droit', 265],
    ],
  );
  assert.deepEqual(ledsFromCabinet(cab), leds, 'relu dans l’éditeur sans rien perdre');
  // Avec la KL25Z et le Teensy branchés, la configtool importée (51 et 30) : rien à redire.
  fs.writeFileSync(path.join(dir, 'directoutputconfig51.ini'), INI);
  fs.writeFileSync(path.join(dir, 'directoutputconfig30.ini'), INI);
  const devices = [usb(0x1209, 0xeaea), usb(0x16c0, 0x0483, { port: 'COM5' })];
  assert.deepEqual(dofFindings(readDofSetup(dir), detectDofControllers(devices), devices), []);
});

test('DOF : LED adressables en Art-Net (WLED), un contrôleur par univers, 170 LED au plus chacun', () => {
  const leds: CabinetLeds = {
    controller: 'ArtNet',
    port: '',
    address: '192.168.1.50',
    universe: 0,
    strips: [
      { name: 'Côté gauche', output: 1, width: 1, height: 110, arrangement: 'TopDownLeftRight', colorOrder: 'RGB', brightness: 100, dofOutput: 1 },
      { name: 'Haut-parleur gauche', output: 1, width: 24, height: 1, arrangement: 'LeftRightTopDown', colorOrder: 'RGB', brightness: 100, dofOutput: 7 },
      { name: 'Côté droit', output: 2, width: 1, height: 130, arrangement: 'TopDownLeftRight', colorOrder: 'RGB', brightness: 100, dofOutput: 4 },
    ],
  };
  assert.deepEqual(ledProblems(leds), []);
  assert.deepEqual(stripFirstLeds(leds), [1, 111, 1], 'la numérotation repart de 1 à chaque univers');
  const dir = tmp();
  for (const f of planLedWrite(dir, leds).files) fs.writeFileSync(f.file, f.content);
  const setup = readDofSetup(dir);
  assert.deepEqual(
    setup.cabinet!.controllers.map((c) => [c.type, c.name, c.universe, c.address]),
    [
      ['ArtNet', 'Art-Net 0', 0, '192.168.1.50'],
      ['ArtNet', 'Art-Net 1', 1, '192.168.1.50'],
    ],
  );
  assert.deepEqual(
    setup.cabinet!.strips.map((s) => [s.name, s.controller, s.firstLed]),
    [
      ['Côté gauche', 'Art-Net 0', 1],
      ['Haut-parleur gauche', 'Art-Net 0', 111],
      ['Côté droit', 'Art-Net 1', 1],
    ],
  );
  assert.deepEqual(ledsFromCabinet(setup.cabinet!), leds, 'relu dans l’éditeur sans rien perdre');
  // Art-Net n'a pas de port série : rien à redire, même sans périphérique USB.
  fs.writeFileSync(path.join(dir, 'directoutputconfig30.ini'), INI);
  assert.deepEqual(dofFindings(readDofSetup(dir), [], []), []);
  // Un univers trop chargé, une adresse fausse.
  const crowded = { ...leds, address: 'wled.local', strips: [{ ...leds.strips[0]!, height: 200 }] };
  const problems = ledProblems(crowded);
  assert.ok(problems.some((p) => p.includes('200')), problems.join(' | '));
  assert.ok(problems.some((p) => p.includes('wled.local')), problems.join(' | '));
});

test('DOF : DudesCab et Pinscape Pico portent leurs bandes, Cyber Pinball n’écrit rien pour elles', () => {
  for (const controller of ['DudesCab', 'PinscapePico'] as const) {
    const problems = ledProblems({ controller, port: '', strips: [] });
    assert.equal(problems.length, 1, controller);
    assert.match(problems[0]!, /outil de la carte/);
  }
  assert.equal(DOF_CONTROLLERS.DudesCab.addressable, true);
  assert.equal(DOF_CONTROLLERS.PinscapePico.addressable, true);
});

test('DOF : alignement avec WLED en Art-Net « Multi RGB » (170 LED par univers, « Start » de chaque bande)', () => {
  // Cas réel du 05/11/2026 : un ESP32 sous WLED, 2 bandes de 120 LED de part et d'autre du playfield
  // et 2 anneaux au fronton, une bande par univers à partir de l'univers 0.
  const strip = (name: string, output: number, width: number, height: number, dofOutput: number) =>
    ({ name, output, width, height, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 100, dofOutput }) as const;
  const leds: CabinetLeds = {
    controller: 'ArtNet',
    port: '',
    universe: 0,
    strips: [strip('Côté gauche', 1, 1, 120, 1), strip('Côté droit', 2, 1, 120, 4), strip('Haut-parleur gauche', 3, 32, 1, 7), strip('Haut-parleur droit', 4, 32, 1, 10)],
  };
  assert.deepEqual(
    wledSegments(leds).map((g) => [g.name, g.universe, g.start, g.length]),
    [
      ['Côté gauche', 0, 0, 120],
      ['Côté droit', 1, 170, 120],
      ['Haut-parleur gauche', 2, 340, 32],
      ['Haut-parleur droit', 3, 510, 32],
    ],
    'chaque bande commence au début de son univers dans WLED : des trous, pas 0, 120, 240…',
  );
  assert.equal(wledLedCount(leds), 542);
  // Ce que DOF envoie concorde : chaque bande au canal 1 de son univers (FirstLedNumber 1, contrôleur par univers).
  const dir = tmp();
  for (const f of planLedWrite(dir, leds).files) fs.writeFileSync(f.file, f.content);
  const cab = readDofSetup(dir).cabinet!;
  for (const g of wledSegments(leds)) {
    const s = cab.strips.find((x) => x.name === g.name)!;
    const c = cab.controllers.find((x) => x.name === s.controller)!;
    assert.equal(c.universe, g.universe, g.name);
    // LED k de WLED : univers 0 + k ÷ 170, position k mod 170 (+1 pour FirstLedNumber).
    assert.equal(Math.floor(g.start / 170), c.universe! - 0, g.name);
    assert.equal((g.start % 170) + 1, s.firstLed, g.name);
  }
  // Deux bandes sur un même univers : la seconde suit la première, puis l'univers suivant repart à 170.
  const shared: CabinetLeds = { ...leds, universe: 1, strips: [strip('A', 1, 1, 100, 1), strip('B', 1, 1, 50, 4), strip('C', 2, 1, 60, 7)] };
  assert.deepEqual(
    wledSegments(shared).map((g) => [g.name, g.universe, g.start]),
    [
      ['A', 1, 0],
      ['B', 1, 100],
      ['C', 2, 170],
    ],
  );
  assert.deepEqual(wledSegments({ ...leds, controller: 'TeensyStripController', port: 'COM5' }), []);
});
