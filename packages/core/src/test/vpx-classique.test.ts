// Compatibilité des VPX classiques : lancement sans éditeur, POV et réglages indépendants.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { IniDocument } from '../index';
import { REPO_ROOT } from './i18n-scan';
import { frontendSource } from './frontend-source';

const compat = require(path.join(REPO_ROOT, 'app', 'dist', 'vpx-launch-compat.js')) as {
  vpxLaunchArguments(opts: { version?: string; table: string; ini?: string; tableIni?: string; display?: boolean }): string[];
  prepareClassicPov(version: string, table: string, dataDir: string): string | undefined;
};
const launcher = require(path.join(REPO_ROOT, 'app', 'dist', 'launcher.js')) as { vpxPrefDir(version: string): string };

test('VPX classique : éditeur masqué dès le lancement, pause conservée et chemins passés sans découpage', () => {
  for (const version of ['10.7.4.1', '10.8.0.2051']) {
    assert.deepEqual(compat.vpxLaunchArguments({ version, table: 'Une table.vpx' }), ['-ExtMinimized', '-Play', 'Une table.vpx']);
  }
  for (const version of ['10.8.1-5436', '10.9.0.123', undefined]) {
    assert.deepEqual(compat.vpxLaunchArguments({ version, table: 'Une table.vpx', ini: 'Une config.ini', tableIni: 'Une vue.ini', display: true }), ['-Ini', 'Une config.ini', '-TableIni', 'Une vue.ini', '-PovEdit', 'Une table.vpx']);
  }
  const base = path.join(process.env.APPDATA ?? os.homedir(), 'VPinballX');
  assert.equal(launcher.vpxPrefDir('10.8.0.2051'), base);
  assert.equal(launcher.vpxPrefDir('10.8.1-5436'), path.join(base, '10.8'));
});

test('VPX 10.8.0 : un INI de vue partiel ne masque plus le POV ; les autres réglages sont conservés', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-classique-pov-'));
  const table = path.join(dir, 'Comete.vpx');
  const ini = path.join(dir, 'Comete.ini');
  const pov = path.join(dir, 'Comete.pov');
  fs.writeFileSync(table, 'table');
  const partial = '[Player]\nCabinetAutofitMode = 1\nFXAA = 0\n[TableOverride]\nViewCabRotation = 90\n';
  fs.writeFileSync(ini, partial);
  fs.writeFileSync(pov, '<POV><fullscreen><rotation>270</rotation><xscale>1.2</xscale><yoffset>8</yoffset></fullscreen></POV>');
  const file = compat.prepareClassicPov('10.8.0.2051', table, path.join(dir, 'data'))!;
  assert.ok(file && file !== ini);
  const result = IniDocument.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(result.get('TableOverride', 'ViewCabRotation'), '270');
  assert.equal(result.get('TableOverride', 'ViewCabScaleX'), '1.2');
  assert.equal(result.get('Player', 'FXAA'), '0');
  assert.equal(fs.readFileSync(ini, 'utf8'), partial);
  fs.appendFileSync(file, '\n[Audio]\nVolume = 42\n');
  assert.equal(compat.prepareClassicPov('10.8.0.2051', table, path.join(dir, 'data')), file);
  assert.match(fs.readFileSync(file, 'utf8'), /Volume = 42/);
  fs.writeFileSync(pov, '<POV><fullscreen><xscale>1.5</xscale></fullscreen></POV>');
  assert.notEqual(compat.prepareClassicPov('10.8.0.2051', table, path.join(dir, 'data')), file);
  fs.writeFileSync(ini, partial + 'ViewCabScaleX = 1.1\n');
  assert.equal(compat.prepareClassicPov('10.8.0.2051', table, path.join(dir, 'data')), undefined);
  assert.equal(compat.prepareClassicPov('10.8.1-5436', table, path.join(dir, 'data')), undefined);
  assert.equal(compat.prepareClassicPov('10.7.4', table, path.join(dir, 'data')), undefined);
});

test('rapport : le journal retenu est celui du VPX qui a joué, même après une partie réussie', () => {
  const evidence = require(path.join(REPO_ROOT, 'app', 'dist', 'launch-evidence.js')) as {
    rememberLaunch(result: { ok: boolean; logPath?: string; logWritten?: boolean }, table: string): void;
    launchAttachments(text: string): { kind: string }[];
    lastLaunchLogPath(): string | undefined;
  };
  evidence.rememberLaunch({ ok: false, logPath: 'C:/Ancien/vpinball.log' }, 'Comete');
  assert.equal(evidence.lastLaunchLogPath(), 'C:/Ancien/vpinball.log');
  evidence.rememberLaunch({ ok: true, logPath: 'C:/Autre/vpinball.log' }, 'Comete');
  assert.equal(evidence.lastLaunchLogPath(), 'C:/Autre/vpinball.log');
  evidence.rememberLaunch({ ok: true, logPath: 'C:/Autre/vpinball.log', logWritten: false }, 'Comete');
  assert.deepEqual(evidence.launchAttachments('ancien journal').map((a) => a.kind), ['previous-log']);
  evidence.rememberLaunch({ ok: true }, 'Comete');
  assert.equal(evidence.lastLaunchLogPath(), undefined);
  assert.match(frontendSource(), /const previous = lastLaunchLogPath\(\);/);
});

test('autre VPX : Exit est lu pendant la partie et le sondage est arrêté au retour', () => {
  const source = frontendSource();
  assert.match(source, /const stopOtherExit = otherVpx && simulated === undefined.*watchExitWhileWaiting.*game.stop/);
  assert.match(source, /stopOtherExit\?\.\(\);/);
  assert.match(source, /version: install.version/);
  assert.match(source, /const classicTableIni = otherVpx && simulated === undefined \? prepareClassicPov\(install.version, played.file, loc.dataDir\) : undefined;/);
  assert.match(source, /tableIni: classicTableIni/);
});
