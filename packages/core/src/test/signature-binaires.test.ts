// Signature des binaires livrés (scripts/signature.mjs, appelé par scripts/fabriquer.mjs). Le
// 19/11/2026, un antivirus a mis en quarantaine l'exécutable de Cyber Pinball, non signé, comme
// cheval de Troie ; l'application livre aussi ses propres DLL et exécutables (plugins de VPX, couche
// OpenXR, compagnon du casque, serveur du DMD), tous non signés. Invariant : quand un certificat est
// configuré, chaque binaire de natif\ est signé, et avant le paquet de mise à jour qui l'embarque.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './i18n-scan';

interface Signature {
  BINARY_EXTENSIONS: string[];
  binariesIn(dir: string): string[];
  signAll(dir: string): Promise<string[]>;
  signatureConfigured(): boolean;
}

const load = async () => (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'signature.mjs')).href)) as Signature;
const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');

test('signature : tous les binaires d’un dossier, sous-dossiers compris, rien d’autre', async () => {
  const { binariesIn } = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-signature-'));
  try {
    const files = ['compagnon.exe', 'vision3d/plugin64.dll', 'couche/XR_LAYER.DLL', 'reseau/addon.node', 'vision3d/plugin.cfg', 'couche/layer.json', 'decor/caisse.png'];
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), '');
    }
    const found = binariesIn(dir).map((f) => path.relative(dir, f).split(path.sep).join('/'));
    assert.deepEqual(found.sort(), ['compagnon.exe', 'couche/XR_LAYER.DLL', 'reseau/addon.node', 'vision3d/plugin64.dll']);
    assert.deepEqual(binariesIn(path.join(dir, 'absent')), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('signature : sans certificat configuré, rien n’est signé et la fabrication continue', async (t) => {
  const vars = ['CYBERPINBALL_SIGN_ARGS', 'CYBERPINBALL_SIGN_PFX', 'CYBERPINBALL_SIGN_SHA1'];
  const saved = Object.fromEntries(vars.map((v) => [v, process.env[v]]));
  t.after(() => {
    for (const v of vars) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  });
  for (const v of vars) delete process.env[v];
  const { signAll, signatureConfigured } = await load();
  assert.equal(signatureConfigured(), false);
  assert.deepEqual(await signAll(REPO_ROOT), []);
});

test('fabrication : les binaires de natif\\ sont signés avant le paquet de mise à jour', () => {
  const script = read('scripts', 'fabriquer.mjs');
  const signNative = script.indexOf("await signAll(path.join(stage, 'natif'))");
  assert.ok(signNative > 0, 'fabriquer.mjs doit signer natif\\ (signAll)');
  // Le premier paquet (publication rapide, --application) comme le second embarquent natif\.
  const firstPackage = script.indexOf('packageApplication();');
  assert.ok(firstPackage > signNative, 'la signature de natif\\ doit précéder le premier packageApplication()');
  // Nos binaires vont tous sous natif\ : aucune copie d'un .exe ou d'un .dll ailleurs dans build\app
  // (les .node du réseau des bornes viennent de npm, tels que publiés par leurs auteurs).
  for (const m of script.matchAll(/path\.join\(stage, '([^']+)'/g)) assert.doesNotMatch(m[1] ?? '', /\.(exe|dll)$/i, `binaire hors de natif\\ : ${m[1]}`);
});

test('publication : un rappel tant que les exécutables partent non signés', () => {
  const script = read('scripts', 'publier.mjs');
  assert.match(script, /import \{ signatureConfigured \} from '\.\/signature\.mjs'/);
  assert.match(script, /if \(!signatureConfigured\(\)\) \{\s*console\.log\(`Signature : aucun certificat configuré/);
});
