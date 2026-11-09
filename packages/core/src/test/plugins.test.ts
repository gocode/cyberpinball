import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { checkPlugin, discoverPlugins, PLUGIN_FILE, pluginsDir, signPlugin } from '../plugins';

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), pub: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

/** <données>\plugins\<id>\ avec un index.js et un sous-dossier. */
function plugin(id = 'essai'): { data: string; dir: string } {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ext-'));
  const dir = path.join(pluginsDir(data), id);
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.js'), "exports.activate = () => {};\n");
  fs.writeFileSync(path.join(dir, 'lib', 'outil.js'), 'module.exports = 1;\n');
  return { data, dir };
}

const info = (id = 'essai') => ({ id, name: 'Essai', version: '1.0.0', main: 'index.js' });

test('extensions : une extension signée par la clé reconnue est acceptée, tous ses fichiers listés', () => {
  const k = keys();
  const { dir } = plugin();
  const manifest = signPlugin(dir, info(), k.priv);
  assert.deepEqual(Object.keys(manifest.files), ['index.js', 'lib/outil.js']);
  const check = checkPlugin(dir, k.pub);
  assert.equal(check.ok, true);
});

test('extensions : non signée, signée par une autre clé, ou modifiée après signature, elle est refusée', () => {
  const k = keys();
  const other = keys();
  const { dir } = plugin();
  assert.equal(checkPlugin(dir, k.pub).ok, false);
  signPlugin(dir, info(), other.priv);
  assert.equal(checkPlugin(dir, k.pub).ok, false);
  signPlugin(dir, info(), k.priv);
  fs.appendFileSync(path.join(dir, 'lib', 'outil.js'), '// ajout\n');
  const check = checkPlugin(dir, k.pub);
  assert.equal(check.ok, false);
  assert.match(!check.ok ? check.reason : '', /modified file lib\/outil\.js/);
  signPlugin(dir, info(), k.priv);
  fs.rmSync(path.join(dir, 'lib', 'outil.js'));
  assert.equal(checkPlugin(dir, k.pub).ok, false);
});

test('extensions : un manifeste retouché (fichier retiré de la liste, autre dossier) est refusé', () => {
  const k = keys();
  const { dir } = plugin();
  signPlugin(dir, info(), k.priv);
  const envelope = JSON.parse(fs.readFileSync(path.join(dir, PLUGIN_FILE), 'utf8')) as { manifest: string };
  const manifest = JSON.parse(envelope.manifest) as { files: Record<string, string> };
  delete manifest.files['lib/outil.js'];
  envelope.manifest = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(dir, PLUGIN_FILE), JSON.stringify(envelope));
  assert.equal(checkPlugin(dir, k.pub).ok, false);
  const second = plugin('autre');
  signPlugin(second.dir, info('essai'), k.priv);
  assert.equal(checkPlugin(second.dir, k.pub).ok, false);
});

test('extensions : le dossier plugins absent ne donne rien ; présent, chaque dossier est vérifié', () => {
  const k = keys();
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ext-'));
  assert.deepEqual(discoverPlugins(empty, k.pub), []);
  const { data, dir } = plugin();
  signPlugin(dir, info(), k.priv);
  fs.mkdirSync(path.join(pluginsDir(data), 'brouillon'));
  const found = discoverPlugins(data, k.pub);
  assert.deepEqual(
    found.map((f) => [path.basename(f.dir), f.ok]),
    [
      ['brouillon', false],
      ['essai', true],
    ],
  );
});

test('extensions : identifiant ou fichier principal invalides refusés à la signature', () => {
  const k = keys();
  const { dir } = plugin();
  assert.throws(() => signPlugin(dir, { ...info(), id: '../x' }, k.priv));
  assert.throws(() => signPlugin(dir, { ...info(), main: 'absent.js' }, k.priv));
});
