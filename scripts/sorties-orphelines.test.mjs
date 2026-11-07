import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { orphanOutputs, removeOrphanOutputs } from './sorties-orphelines.mjs';

function write(file, text = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test('une sortie compilée sans source est retirée, le reste de dist\\ ne bouge pas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sorties-orphelines-'));
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/core'] }));
    const core = path.join(root, 'packages', 'core');
    write(path.join(core, 'src', 'garde.ts'));
    write(path.join(core, 'src', 'test', 'garde.test.ts'));
    write(path.join(core, 'src', 'vue.tsx'));
    for (const ext of ['.js', '.js.map', '.d.ts', '.d.ts.map']) {
      write(path.join(core, 'dist', `garde${ext}`));
      write(path.join(core, 'dist', 'test', `garde.test${ext}`));
      write(path.join(core, 'dist', 'test', `retire.test${ext}`));
      write(path.join(core, 'dist', `retire${ext}`));
    }
    write(path.join(core, 'dist', 'vue.js'));
    write(path.join(core, 'dist', 'donnees.json'));
    write(path.join(core, 'dist', 'tsconfig.tsbuildinfo'));

    const expected = ['.d.ts', '.d.ts.map', '.js', '.js.map']
      .flatMap((ext) => [path.join(core, 'dist', `retire${ext}`), path.join(core, 'dist', 'test', `retire.test${ext}`)])
      .sort();
    assert.deepEqual(orphanOutputs(root), expected);
    assert.deepEqual(removeOrphanOutputs(root), expected);
    assert.deepEqual(orphanOutputs(root), []);
    for (const kept of ['garde.js', 'test/garde.test.js', 'vue.js', 'donnees.json', 'tsconfig.tsbuildinfo']) {
      assert.ok(fs.existsSync(path.join(core, 'dist', kept)), kept);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm run build retire les sorties orphelines avant de compiler', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.build, /sorties-orphelines\.mjs.*tsc -b/);
});
