// Signe une extension de Cyber Pinball (packages/core/src/plugins.ts) avec la clé de
// publication des mises à jour (scripts/cle-publication.mjs), et l'installe signée.
//
//   node scripts/signer-extension.mjs <dossier source> <dossier plugins>
//
// Le dossier source porte un extension.json { id, name, version, main } et les fichiers de
// l'extension ; ils sont copiés dans <dossier plugins>\<id>\ (remplacé s'il existe), puis
// plugin.json y est écrit : empreinte de chaque fichier, signée. Le dossier plugins d'une
// borne est <données>\plugins. Compiler d'abord : npm run build (le script lit packages/core/dist).

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPrivateKey } from './cle-publication.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugins = require(path.join(repo, 'packages', 'core', 'dist', 'plugins.js'));
const { copyTree } = require(path.join(repo, 'packages', 'core', 'dist', 'copytree.js'));

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error('Usage : node scripts/signer-extension.mjs <dossier source> <dossier plugins>');
  process.exit(1);
}
const info = JSON.parse(fs.readFileSync(path.join(source, 'extension.json'), 'utf8'));
const out = path.join(target, info.id);
const privateKey = loadPrivateKey();
fs.rmSync(out, { recursive: true, force: true });
copyTree(source, out, { filter: (from) => path.basename(from) !== 'extension.json' && path.basename(from) !== plugins.PLUGIN_FILE });
const manifest = plugins.signPlugin(out, info, privateKey);
const check = plugins.checkPlugin(out);
if (!check.ok) {
  console.error(`Extension signée mais refusée à la relecture : ${check.reason}`);
  process.exit(1);
}
console.log(`Extension ${manifest.id} ${manifest.version} signée : ${out} (${Object.keys(manifest.files).length} fichiers).`);
