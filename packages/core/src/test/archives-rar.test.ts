// RAR que le tar de Windows refuse (app/src/archives.ts) : 20/11/2026, PinCab, « Declared dictionary size
// is not supported » sur un RAR5 à grand dictionnaire (ghostbusters_table_main-1.3.rar), et la table
// restait « Rien à installer ». Le secours node-unrar-js (décompresseur de RARLAB en WebAssembly) prend le
// relais ; ici : les noms ramenés sous le dossier de destination, la reconnaissance d'un RAR, le
// branchement sur l'échec de tar, et la fabrication qui livre le .wasm.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const archives = require(path.join(REPO_ROOT, 'app', 'dist', 'archives.js')) as {
  isRar(file: string): boolean;
  safeEntryName(name: string): string;
  unrarList(file: string, tarError?: Error): Promise<string[]>;
};

test('noms des entrées : toujours sous le dossier de destination', () => {
  assert.equal(archives.safeEntryName('Tables\\Ghostbusters.vpx'), 'Tables/Ghostbusters.vpx');
  assert.equal(archives.safeEntryName('../../Windows/evil.dll'), 'Windows/evil.dll');
  assert.equal(archives.safeEntryName('C:\\Windows\\evil.dll'), 'Windows/evil.dll');
  assert.equal(archives.safeEntryName('/abs/./table.vpx'), 'abs/table.vpx');
});

test('un RAR se reconnaît à son nom ou à sa signature « Rar! », même mal nommé', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-rar-'));
  const misnamed = path.join(dir, 'table.zip');
  fs.writeFileSync(misnamed, Buffer.concat([Buffer.from('Rar!\x1a\x07\x01\x00', 'latin1'), Buffer.alloc(16)]));
  const zip = path.join(dir, 'vrai.zip');
  fs.writeFileSync(zip, Buffer.from('PK\x03\x04', 'latin1'));
  assert.equal(archives.isRar(path.join(dir, 'absent.rar')), true, 'au nom');
  assert.equal(archives.isRar(misnamed), true, 'à la signature');
  assert.equal(archives.isRar(zip), false);
});

test('RAR illisible même pour unrar : l’erreur dit pourquoi tar l’a refusé, puis ce qu’en dit unrar', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-rar-'));
  const broken = path.join(dir, 'abime.rar');
  fs.writeFileSync(broken, 'pas un RAR');
  await assert.rejects(archives.unrarList(broken, new Error('tar.exe: Declared dictionary size is not supported')), /Declared dictionary size is not supported ; unrar : /);
});

test('branchement : tar d’abord, node-unrar-js en secours pour un RAR (liste et déballage) ; le .wasm est livré', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'archives.ts'), 'utf8');
  const list = src.slice(src.indexOf('async function listArchive('), src.indexOf('async function extractArchive('));
  assert.match(list, /tar\(\['-tf', file\]\)[\s\S]*if \(!isRar\(file\)\) throw error;[\s\S]*unrarList\(file/);
  const extract = src.slice(src.indexOf('async function extractArchive('), src.indexOf('export function isRar('));
  assert.match(extract, /tar\(\['-xf', file, '-C', dest\]\)[\s\S]*if \(!isRar\(file\)\) throw error;[\s\S]*unrarExtract\(file, dest/);
  const build = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'fabriquer.mjs'), 'utf8');
  assert.match(build, /node-unrar-js\/dist\/js\/unrar\.wasm'\), path\.join\(stage, 'dist', 'unrar\.wasm'\)/);
});
