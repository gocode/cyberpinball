import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const { cleanupImportStaging } = require(path.join(REPO_ROOT, 'app', 'dist', 'import-cleanup.js')) as {
  cleanupImportStaging(staging: string, stagingRoot: string): Promise<boolean>;
};

test('nettoyage d’import : retire le déballage et conserve les fichiers choisis, même répété', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-import-cleanup-'));
  try {
    const source = path.join(root, 'table.zip');
    fs.writeFileSync(source, 'archive choisie');
    const stagingRoot = path.join(root, 'staging');
    fs.mkdirSync(stagingRoot);
    const staging = fs.mkdtempSync(path.join(stagingRoot, 'import-'));
    fs.mkdirSync(path.join(staging, 'table'));
    fs.writeFileSync(path.join(staging, 'table', 'table.vpx'), 'déballée');
    assert.equal(await cleanupImportStaging(staging, stagingRoot), true);
    assert.equal(await cleanupImportStaging(staging, stagingRoot), true);
    assert.equal(fs.existsSync(staging), false);
    assert.equal(fs.readFileSync(source, 'utf8'), 'archive choisie');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('nettoyage d’import : un verrou ne bloque pas le parcours et les demandes simultanées partagent le nettoyage', async (t) => {
  const root = path.join(os.tmpdir(), 'cp-import-locked');
  const staging = path.join(root, 'import-locked');
  let release!: (value: void) => void;
  const lock = new Promise<void>((resolve) => release = resolve);
  const remove = t.mock.method(fs.promises, 'rm', async () => {
    await lock;
    throw Object.assign(new Error('fichier encore ouvert'), { code: 'EPERM' });
  });
  const warn = t.mock.method(console, 'warn', () => {});
  const first = cleanupImportStaging(staging, root);
  const second = cleanupImportStaging(staging, root);
  assert.equal(first, second);
  assert.equal(remove.mock.callCount(), 1);
  // La demande rend la main pendant que Windows tient le fichier ; aucune exception ne remonte.
  release();
  assert.equal(await first, false);
  assert.equal(warn.mock.callCount(), 1);
  remove.mock.restore();
  const retry = t.mock.method(fs.promises, 'rm', async () => {});
  assert.equal(await cleanupImportStaging(staging, root), true, 'un nouvel essai reste possible après le verrou');
  assert.equal(retry.mock.callCount(), 1);
});

test('nettoyage d’import : refuse la racine, les originaux et les chemins qui sortent du déballage', async (t) => {
  const root = path.join(os.tmpdir(), 'cp-import-boundary', 'staging');
  const remove = t.mock.method(fs.promises, 'rm', async () => {});
  t.mock.method(console, 'warn', () => {});
  for (const target of [root, path.dirname(root), path.join(root, '..', 'import-original'), path.join(root, 'tables'), path.join(root, 'import-one', 'import-two')]) {
    assert.equal(await cleanupImportStaging(target, root), false);
  }
  assert.equal(remove.mock.callCount(), 0);
});

test('les sorties du parcours d’import ne dépendent pas de la suppression du dossier temporaire', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'library.ts'), 'utf8');
  assert.doesNotMatch(source, /fs\.rmSync\((?:s\.)?prepared\.staging/);
  assert.equal(source.match(/void cleanupImportStaging\(/g)?.length, 3, 'annulation, ajout Future Pinball et installation terminée');
});
