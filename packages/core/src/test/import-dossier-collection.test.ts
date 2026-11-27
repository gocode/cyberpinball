import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { planImport } from '../tableimport';

// Un dossier choisi à l'import est un « paquet » : les versions d'une même table. Un dossier qui
// rassemble des jeux différents (le dossier Tables d'une autre installation, glissé tel quel) donnait
// une seule table : 37 .vpx dans un dossier, sous le titre d'un seul d'entre eux.

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-collection-'));
}

function write(file: string, content = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

const vpxOf = (plan: ReturnType<typeof planImport>) => plan.tables.map((t) => t.steps.filter((s) => s.kind === 'table').length);

test('dossier de jeux différents : une table par jeu, pas un seul dossier pour tous', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'Tables');
  for (const n of ['Addams Family (Bally 1992)', 'Batman Forever (Sega 1995)', 'Ace Of Speed (2021)', 'Iron Man (Stern 2014)']) write(path.join(dir, `${n}.vpx`));
  const plan = planImport([{ path: dir, mode: 'copy' }], { tablesDir: path.join(root, 'cp') });
  assert.equal(plan.tables.length, 4);
  assert.deepEqual(vpxOf(plan), [1, 1, 1, 1]);
  assert.equal(new Set(plan.tables.map((t) => t.folder)).size, 4);
  fs.rmSync(root, { recursive: true });
});

test('dossier de versions d’une même table : une seule table', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'Tables');
  for (const n of ['AC-DC Premium (Stern 2012) 1.0', 'AC-DC Premium (Stern 2012) VR', 'AC-DC Premium (Stern 2012) 1.1 FS']) write(path.join(dir, `${n}.vpx`));
  const plan = planImport([{ path: dir, mode: 'copy' }], { tablesDir: path.join(root, 'cp') });
  assert.equal(plan.tables.length, 1);
  assert.deepEqual(vpxOf(plan), [3]);
  fs.rmSync(root, { recursive: true });
});

test('dossier mêlant versions et autres jeux : les versions restent ensemble, les autres à part', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'Tables');
  for (const n of ['AC-DC Premium (Stern 2012) 1.0', 'AC-DC Premium (Stern 2012) VR', 'Batman Forever (Sega 1995)', 'Addams Family (Bally 1992)']) write(path.join(dir, `${n}.vpx`));
  const plan = planImport([{ path: dir, mode: 'copy' }], { tablesDir: path.join(root, 'cp') });
  assert.deepEqual(vpxOf(plan).sort(), [1, 1, 2]);
  fs.rmSync(root, { recursive: true });
});

test('archive d’une table dont les versions ont des noms éloignés du titre : toujours une table', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'Stranger Things 4');
  write(path.join(dir, 'Stranger Things 4 Desktop.vpx'));
  write(path.join(dir, 'Stranger Things 4 VR.vpx'));
  const plan = planImport([{ path: dir, mode: 'move', unpacked: true, label: 'Stranger Things 4.zip' }], { tablesDir: path.join(root, 'cp') });
  assert.equal(plan.tables.length, 1);
  assert.deepEqual(vpxOf(plan), [2]);
  fs.rmSync(root, { recursive: true });
});
