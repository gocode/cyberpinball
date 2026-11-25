// Les bancs natifs ne sont lancés que construits depuis leurs sources (banc-natif.ts, 25/11/2026).

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { newestSourceMs } from './banc-natif';
import { removeTempDir } from './temp-dir';

test('bancs natifs : tout essai qui lance un banc-*.exe passe par nativeBench (pas construit ou périmé : écarté)', () => {
  const dir = __dirname.replace(`${path.sep}dist${path.sep}`, `${path.sep}src${path.sep}`);
  const direct = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.test.ts'))
    .filter((f) => /'Release',\s*'banc-[\w-]+\.exe'/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(direct, [], 'chemin de banc écrit à la main');
});

test('bancs natifs : chaque construction réussie laisse son témoin (Release/construit.txt)', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'vision3d.mjs'), 'utf8');
  assert.match(script, /VISION3D_BUILT = path\.join\(build, 'Release', 'construit\.txt'\)/);
  const success = script.slice(script.indexOf("compilation échouée"));
  assert.match(success, /fs\.writeFileSync\(VISION3D_BUILT,[\s\S]*?return VISION3D_DLL;/);
});

test('bancs natifs : la date des sources est celle du plus récent fichier C/C++ ou CMake, sous-dossiers compris', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-natif-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    const at = (file: string, s: number) => {
      fs.writeFileSync(path.join(dir, file), '');
      fs.utimesSync(path.join(dir, file), s, s);
    };
    at('CMakeLists.txt', 1000);
    at(path.join('src', 'arrets.h'), 3000);
    at('notes.md', 9000);
    assert.equal(newestSourceMs(dir), 3_000_000);
  } finally {
    removeTempDir(dir);
  }
});
