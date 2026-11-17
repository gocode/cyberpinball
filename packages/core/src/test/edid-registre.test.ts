// EDID des écrans (17/11/2026) : relevés plusieurs fois à chaque lancement d'une table, ils étaient lus
// en lançant reg.exe, un processus bloquant par écran et par relevé, pendant l'animation de lancement.
// Invariant : l'EDID passe par l'API du registre (registry.ts, sans processus) et n'est lu qu'une fois
// par écran ; aucun reg.exe dans la détection des écrans.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const WIN_DISPLAYS = path.join(__dirname, '..', '..', '..', 'win-displays');

interface EdidApi {
  readEdidBytes(devicePath: string, read: (key: string, name: string) => unknown): Uint8Array | undefined;
  edidRegistryKey(devicePath: string): string | undefined;
  clearEdidCache(): void;
}

function api(): EdidApi | undefined {
  if (process.platform !== 'win32') return undefined;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(WIN_DISPLAYS, 'dist', 'index.js')) as EdidApi;
}

const DEVICE = '\\\\?\\DISPLAY#ABC0123#1&0123abcd&0&UID100#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}';

test('EDID : clé du registre tirée du chemin de périphérique, sous HKLM', { skip: process.platform === 'win32' ? false : 'Windows requis' }, () => {
  const { edidRegistryKey } = api()!;
  assert.equal(edidRegistryKey(DEVICE), 'SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\ABC0123\\1&0123abcd&0&UID100\\Device Parameters');
  assert.equal(edidRegistryKey('sans-dièse'), undefined);
  assert.equal(edidRegistryKey('a##b'), undefined);
});

test('EDID : lu une seule fois par écran, un échec n’est pas gardé, une valeur trop courte n’est pas un EDID', { skip: process.platform === 'win32' ? false : 'Windows requis' }, () => {
  const { readEdidBytes, clearEdidCache } = api()!;
  clearEdidCache();
  const edid = new Uint8Array(256).fill(7);
  let reads = 0;
  const read = (key: string, name: string) => {
    reads++;
    assert.equal(name, 'EDID');
    assert.match(key, /^SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\/);
    return edid;
  };
  assert.equal(readEdidBytes(DEVICE, read), edid);
  assert.equal(readEdidBytes(DEVICE, read), edid);
  assert.equal(reads, 1, 'le second relevé reprend l’EDID déjà lu');

  clearEdidCache();
  let calls = 0;
  const failing = () => {
    calls++;
    if (calls === 1) throw new Error('clé absente');
    return undefined;
  };
  assert.equal(readEdidBytes(DEVICE, failing), undefined);
  assert.equal(readEdidBytes(DEVICE, failing), undefined);
  assert.equal(calls, 2, 'un échec se relit au relevé suivant');
  assert.equal(readEdidBytes(DEVICE, () => new Uint8Array(12)), undefined, 'moins d’un bloc de 128 octets');
  assert.equal(readEdidBytes(DEVICE, () => 'texte'), undefined);
  clearEdidCache();
});

test('EDID : aucun reg.exe ni processus lancé dans la détection des écrans', () => {
  const source = fs.readFileSync(path.join(WIN_DISPLAYS, 'src', 'index.ts'), 'utf8');
  assert.doesNotMatch(source, /child_process/, 'la détection des écrans ne lance aucun processus');
  assert.doesNotMatch(source, /['"]reg(\.exe)?['"]/);
  assert.match(source, /hklmValue/);
});
