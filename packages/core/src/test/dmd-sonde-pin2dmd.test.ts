// DMD réel (bêta) : un PIN2DMD reconnu, au bon pilote, qui reste noir en partie. libdmdutil abandonne en
// silence quand libusb_open ou libusb_claim_interface échoue ; la sonde (app/src/sonde-pin2dmd.ts) fait les
// mêmes étapes avec la libusb de VPX, et ce qu'elle voit est dit à l'écran « DMD réel », dans la Santé et
// dans les points à vérifier avant la partie. Les programmes qui gardent un DMD réel (dmdext, PinUP Popper…)
// sont signalés pour tous les modèles.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { detectHardwareDmds, dmdHolders, hardwareDmdDriverProblem, hardwareDmdFacts, hardwareDmdName, PIN2DMD_PRODUCTS, pin2dmdProbeProblem, vpxDmdSettings } from '../dmd';
import type { LibusbProbe, ObservedUsbDevice } from '../model';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const ID = 'USB\\VID_0314&PID_E457\\5&1&0&2';

function pin2dmd(probe?: LibusbProbe, service = 'WinUSB'): ObservedUsbDevice {
  return { instanceId: ID, vid: 0x0314, pid: 0xe457, service, product: 'PIN2DMD', ...(probe ? { libusbProbe: probe } : {}) };
}

test('sonde du PIN2DMD : chaque étape manquée devient une phrase qui dit quoi faire', () => {
  assert.equal(pin2dmdProbeProblem(undefined), undefined, 'pas encore sondé : rien à dire');
  assert.equal(pin2dmdProbeProblem({ stage: 'ok', code: 0 }), undefined);
  assert.match(pin2dmdProbeProblem({ stage: 'list', code: 0 })!, /la libusb de VPX ne le trouve pas/);
  // Occupé (ACCESS -3 à l'ouverture, BUSY -6 à la réservation) : avec, puis sans programme reconnu.
  assert.match(pin2dmdProbeProblem({ stage: 'open', code: -3, holders: ['dmdext', 'PinUP Popper'] })!, /déjà ouvert par un autre programme \(dmdext et PinUP Popper\).*Fermez-le/);
  assert.match(pin2dmdProbeProblem({ stage: 'claim', code: -6 })!, /déjà ouvert par un autre programme \(dmdext, un autre front-end/);
  // Pilote que la libusb de VPX ne sait pas utiliser (NOT_SUPPORTED -12) : WinUSB par Zadig.
  assert.match(pin2dmdProbeProblem({ stage: 'open', code: -12 }, 'libusb0')!, /pilote actuel \(libusb0\).*WinUSB avec Zadig/);
  assert.match(pin2dmdProbeProblem({ stage: 'open', code: -1 })!, /erreur -1, étape open.*Retours et propositions/);
  // Le nom de la carte (PIN2DMDInit le compare à sa liste) : refusé, dit tel qu'il a été lu, avec les noms acceptés.
  const refused = pin2dmdProbeProblem({ stage: 'name', code: 0, product: 'PIN2DMD EVO' })!;
  assert.match(refused, /se présente sous le nom « PIN2DMD EVO »/);
  assert.match(refused, /« PIN2DMD », « PIN2DMD XL » et « PIN2DMD HD »/);
  assert.match(refused, /ne la pilotera pas.*signalé aux auteurs de VPX/);
  // Illisible (code de libusb) ou vide : la carte s'ouvre, mais VPX ne la pilotera pas non plus.
  assert.match(pin2dmdProbeProblem({ stage: 'name', code: -9 })!, /ne donne pas son nom à la libusb de VPX \(erreur -9\)/);
  assert.match(pin2dmdProbeProblem({ stage: 'name', code: 0 })!, /ne donne pas son nom à la libusb de VPX \(nom vide\)/);
  assert.equal(pin2dmdProbeProblem({ stage: 'ok', code: 0, product: 'PIN2DMD HD' }), undefined);
});

test('sonde du PIN2DMD : le nom lu par libusb donne la taille, et le rapport de la borne montre la sonde telle quelle', () => {
  const hd = pin2dmd({ stage: 'ok', code: 0, product: 'PIN2DMD HD' });
  assert.equal(hardwareDmdName(detectHardwareDmds([hd])[0]!), 'PIN2DMD HD', 'le nom lu par la sonde passe avant celui que Windows a retenu');
  assert.deepEqual(hardwareDmdFacts([hd]).pin2dmdProbe, { stage: 'ok', code: 0, product: 'PIN2DMD HD' });
  assert.equal(hardwareDmdFacts([pin2dmd()]).pin2dmdProbe, undefined, 'pas encore sondé');
  assert.equal(hardwareDmdFacts([hd], { models: { PIN2DMD: 'off' } }).pin2dmdProbe, undefined, 'éteint : rien');
});

test('sonde du PIN2DMD : son verdict passe par le contrôle du pilote, donc partout où il est lu', () => {
  const busy = pin2dmd({ stage: 'open', code: -3, holders: ['dmdext'] });
  const [d] = detectHardwareDmds([busy]);
  assert.match(hardwareDmdDriverProblem(d!)!, /déjà ouvert par un autre programme \(dmdext\)/);
  // Points à vérifier avant la partie : un avertissement, la clé écrite quand même (VPX réessaiera).
  const plan = vpxDmdSettings([busy]);
  assert.ok(plan.findings.some((f) => f.severity === 'warning' && /déjà ouvert/.test(f.message)));
  assert.ok(plan.settings.some((s) => s.key === 'PIN2DMD' && s.value === '1'));
  // Santé de la borne.
  assert.match(hardwareDmdFacts([busy]).problems.join('\n'), /déjà ouvert/);
  // Éteint par « PIN2DMD : non » : rien n'est réclamé.
  assert.deepEqual(hardwareDmdFacts([busy], { models: { PIN2DMD: 'off' } }).problems, []);
  // Ouvert puis relâché : rien à dire.
  assert.equal(hardwareDmdDriverProblem(detectHardwareDmds([pin2dmd({ stage: 'ok', code: 0 })])[0]!), undefined);
  // Un vrai défaut de pilote passe avant la sonde (il l'explique déjà).
  assert.match(hardwareDmdDriverProblem(detectHardwareDmds([pin2dmd({ stage: 'open', code: -12 }, 'HidUsb')])[0]!)!, /pilote actuel : HidUsb/);
});

test('programmes qui gardent un DMD réel : reconnus à leur processus, signalés avant la partie pour tous les modèles', () => {
  assert.deepEqual(dmdHolders(['explorer.exe', 'DMDEXT.exe', 'PinUpMenu.exe', 'PinUpDisplay.exe', 'VPinballX_BGFX64.exe']), ['dmdext', 'PinUP Popper', 'Visual Pinball X']);
  assert.deepEqual(dmdHolders(['explorer.exe', 'CyberPinball.exe']), []);
  const zedmd: ObservedUsbDevice = { instanceId: 'USB\\VID_303A&PID_1001\\1', vid: 0x303a, pid: 0x1001, port: 'COM3', service: 'usbser' };
  const one = vpxDmdSettings([zedmd], undefined, false, ['dmdext']);
  assert.ok(one.findings.some((f) => f.severity === 'warning' && /dmdext est ouvert et garde peut-être le DMD réel/.test(f.message)));
  const two = vpxDmdSettings([zedmd], undefined, false, ['dmdext', 'PinUP Popper']);
  assert.ok(two.findings.some((f) => /dmdext et PinUP Popper sont ouverts/.test(f.message)));
  // Aucun DMD réel allumé : rien à dire, même si dmdext tourne.
  assert.ok(!vpxDmdSettings([], undefined, false, ['dmdext']).findings.some((f) => /dmdext/.test(f.message)));
  assert.ok(!vpxDmdSettings([zedmd], { models: { ZeDMD: 'off' } }, false, ['dmdext']).findings.some((f) => /dmdext/.test(f.message)));
});

test('sonde du PIN2DMD : processus à part, embarqué, jamais pendant une partie ni quand le serveur du DMD tient la carte', () => {
  const sonde = fs.readFileSync(path.join(REPO, 'app', 'src', 'sonde-pin2dmd.ts'), 'utf8');
  assert.doesNotMatch(sonde, /koffi\.view\(/, 'koffi.view plante sous Electron');
  // Toute PIN2DMDInit, dans son ordre : ouvrir, lire le nom, réserver, puis comparer le nom (après avoir relâché).
  assert.match(sonde, /libusb_open[\s\S]*libusb_get_string_descriptor_ascii[\s\S]*libusb_claim_interface[\s\S]*libusb_release_interface/);
  assert.match(sonde, /productName\(handle[\s\S]*claim\(handle, 0\)[\s\S]*done\('name'/);
  // Les noms acceptés : la même liste que le cœur (le module regroupé de la sonde ne l'importe pas).
  const products = /const PRODUCTS = \[([^\]]*)\]/.exec(sonde)![1]!.split(',').map((p) => p.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(products, [...PIN2DMD_PRODUCTS]);
  assert.match(fs.readFileSync(path.join(REPO, 'scripts', 'fabriquer.mjs'), 'utf8'), /f === 'sonde-pin2dmd\.js'/);
  const server = fs.readFileSync(path.join(REPO, 'app', 'src', 'dmd-server.ts'), 'utf8');
  // Sondé quand le serveur ne tourne pas (jamais lancé, ou abandonné faute d'afficheur : onGiveUp) ;
  // la dernière sonde n'est effacée que quand il tient l'afficheur.
  assert.match(server, /if \(!server\.active\(\)\) refreshPin2dmdProbe\(devices\);\s*else if \(server\.ready\(\)\) clearPin2dmdProbe\(\);/);
  assert.match(server, /onGiveUp: \(\) => \{\s*refreshPin2dmdProbe\(/);
  assert.match(server, /onReady: \(\) => \{\s*clearPin2dmdProbe\(\);/);
  const probe = fs.readFileSync(path.join(REPO, 'app', 'src', 'pin2dmd-probe.ts'), 'utf8');
  assert.match(probe, /ELECTRON_RUN_AS_NODE: '1'/);
  assert.match(probe, /windowsHide: true/);
});

test('écran « DMD réel » : la ligne du PIN2DMD dit si la sonde l’a ouvert, ou renvoie à « À vérifier »', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHardwareDmdMenu } = require(path.join(REPO, 'app', 'dist', 'hardware-dmd-menu.js')) as {
    createHardwareDmdMenu(host: object): { build(): { sections: { title?: string; rows: { text: string; detail?: string }[] }[] } };
  };
  const page = (device: ObservedUsbDevice) =>
    createHardwareDmdMenu({
      library: { openCustom: () => undefined, openSystem: () => undefined, openPrompt: () => undefined, openNotice: () => undefined },
      usb: () => [device],
      cabinet: () => undefined,
      save: () => undefined,
      changed: () => undefined,
      menuServer: { problem: () => undefined, ready: () => false },
    }).build();
  const row = (device: ObservedUsbDevice) => page(device).sections.find((s) => s.rows.some((r) => /PIN2DMD/.test(r.text)))!.rows[0]!;
  assert.match(row(pin2dmd({ stage: 'ok', code: 0 })).detail!, /ouvert puis relâché : VPX pourra l’allumer/);
  assert.match(row(pin2dmd({ stage: 'open', code: -3 })).detail!, /ne s’ouvre pas : voir « À vérifier »/);
  assert.match(row(pin2dmd()).detail!, /pilote prêt/);
  const checks = page(pin2dmd({ stage: 'open', code: -3, holders: ['dmdext'] })).sections.find((s) => s.title === 'À vérifier')!;
  assert.match(checks.rows[0]!.text, /déjà ouvert par un autre programme \(dmdext\)/);
});
