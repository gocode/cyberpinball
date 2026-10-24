import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { checkRoot, componentPaths, resolveLocations, writeRootPointer } from '../locations';

function tempAppData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-appdata-'));
}

test('sans racine : bac à sable dans le dossier de données historique', () => {
  const appData = tempAppData();
  const loc = resolveLocations({ APPDATA: appData });
  assert.equal(loc.root, undefined);
  assert.equal(loc.sandbox, true);
  assert.equal(loc.vpxIni, path.join(appData, 'CyberPinball', 'sandbox', 'VPinballX.ini'));
  fs.rmSync(appData, { recursive: true });
});

test('racine mémorisée : données et VPinballX.ini sous la racine, indépendants de la version de VPX', () => {
  const appData = tempAppData();
  writeRootPointer(path.join(appData, 'CyberPinball', 'root.json'), 'D:\\CyberPinball');
  const loc = resolveLocations({ APPDATA: appData });
  assert.equal(loc.root, 'D:\\CyberPinball');
  assert.equal(loc.sandbox, false);
  assert.equal(loc.dataDir, path.join('D:\\CyberPinball', 'data'));
  assert.equal(loc.vpxIni, path.join('D:\\CyberPinball', 'config', 'VPinballX.ini'));
  fs.rmSync(appData, { recursive: true });
});

test('CYBERPINBALL_HOME isole tout, même quand une racine existe', () => {
  const appData = tempAppData();
  writeRootPointer(path.join(appData, 'CyberPinball', 'root.json'), 'D:\\CyberPinball');
  const loc = resolveLocations({ APPDATA: appData, CYBERPINBALL_HOME: 'D:\\tmp\\demo' });
  assert.equal(loc.sandbox, true);
  assert.equal(loc.vpxIni, path.join('D:\\tmp\\demo', 'sandbox', 'VPinballX.ini'));
  fs.rmSync(appData, { recursive: true });
});

test('refuse Program Files, les chemins relatifs et les dossiers réseau', () => {
  const env = { ProgramFiles: 'C:\\Program Files', SystemRoot: 'C:\\Windows' };
  assert.deepEqual(checkRoot('D:\\CyberPinball', env), []);
  assert.equal(checkRoot('C:\\Program Files\\CyberPinball', env).length, 1);
  assert.equal(checkRoot('c:\\program files', env).length, 1);
  assert.equal(checkRoot('CyberPinball', env).length, 1);
  assert.ok(checkRoot('\\\\nas\\pinball', env).length >= 1);
});

test('chaque émulateur a ses versions côte à côte et une jonction « current »', () => {
  const p = componentPaths('D:\\CyberPinball', 'emulators/futurepinball', '1.9.4');
  assert.equal(p.version, path.join('D:\\CyberPinball', 'emulators', 'futurepinball', '1.9.4'));
  assert.equal(p.current, path.join('D:\\CyberPinball', 'emulators', 'futurepinball', 'current'));
});
