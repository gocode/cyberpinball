import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { readRootPointer } from '../locations';
import { loadCabinet, loadOwnedMemory } from '../store';
import { readInfo } from '../tables';
import { emptyCabinet } from './fixtures';

// Le Bloc-notes et Set-Content -Encoding UTF8 de Windows PowerShell écrivent un BOM en tête.
const BOM = '\uFEFF';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-bom-'));
}

test('cabinet.json enregistré avec un BOM : lu comme sans', () => {
  const dir = tmpDir();
  const cabinet = { ...emptyCabinet(), zones: { dmd: { x: 0, y: 0.75, width: 1, height: 0.25 } } };
  fs.writeFileSync(path.join(dir, 'cabinet.json'), BOM + JSON.stringify(cabinet, null, 2), 'utf8');
  // Un modèle d'avant les configurations devient la configuration « Borne ».
  assert.deepEqual(loadCabinet(dir), { ...cabinet, id: 'borne', name: 'Borne' });
  fs.writeFileSync(path.join(dir, 'vpx-owned.json'), BOM + JSON.stringify({ iniPath: 'VPinballX.ini', values: { 'Player.BGSet': '1' } }), 'utf8');
  assert.deepEqual(loadOwnedMemory(dir, 'VPinballX.ini'), { 'Player.BGSet': '1' });
});

test('.info d’une table avec un BOM : ses champs ne sont pas perdus', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'Table.info');
  fs.writeFileSync(file, BOM + JSON.stringify({ Title: 'Terminator 2', User: { StartCount: 12 } }), 'utf8');
  // Avant : JSON.parse échouait, readInfo rendait {} et la partie suivante réécrivait le fichier vide.
  assert.deepEqual(readInfo(file), { Title: 'Terminator 2', User: { StartCount: 12 } });
});

test('root.json avec un BOM : la racine est retrouvée', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'root.json');
  fs.writeFileSync(file, BOM + JSON.stringify({ root: 'D:\\CyberPinball' }), 'utf8');
  assert.equal(readRootPointer(file), 'D:\\CyberPinball');
});
