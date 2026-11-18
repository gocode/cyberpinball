// Décrit les fichiers d'un composant dans son manifeste (packages/installer/components.json, champ « files ») :
// la taille de chaque exécutable et bibliothèque de son archive. Cyber Pinball s'en sert pour voir un dossier
// installé modifié hors de lui (un autre VPX copié par-dessus) et pour en remettre les fichiers d'origine
// (packages/installer/src/component-files.ts).
//   node scripts/composant-fichiers.mjs <archive.zip> [--id vpx]
// L'archive doit être celle du manifeste (même SHA-256) : à refaire à chaque nouvelle version de VPX.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
const archive = args.find((a) => !a.startsWith('--'));
const id = args.includes('--id') ? args[args.indexOf('--id') + 1] : 'vpx';
if (!archive || !fs.existsSync(archive)) {
  console.error('Usage : node scripts/composant-fichiers.mjs <archive.zip> [--id vpx]');
  process.exit(2);
}

const manifestFile = path.join(import.meta.dirname, '..', 'packages', 'installer', 'components.json');
const text = fs.readFileSync(manifestFile, 'utf8');
const manifest = JSON.parse(text);
const list = Array.isArray(manifest) ? manifest : manifest.components;
const sha = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
const component = list.find((c) => c.id === id && c.sha256 === sha);
if (!component) {
  console.error(`Aucun composant « ${id} » du manifeste n'a cette archive (SHA-256 ${sha}).`);
  process.exit(1);
}

// Le tar de Windows (bsdtar) lit les zip ; « -tv » donne la taille de chaque entrée.
const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
const listing = execFileSync(tar, ['-tvf', archive], { encoding: 'latin1', maxBuffer: 64 * 1024 * 1024 });
const files = {};
for (const line of listing.split(/\r?\n/)) {
  const m = /^-\S*\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+\S+\s+(.+)$/.exec(line);
  if (m && /\.(exe|dll)$/i.test(m[2])) files[m[2].replace(/\\/g, '/')] = Number(m[1]);
}
// Archive à un seul dossier de premier niveau : l'installeur remonte son contenu (flattenSingleFolder).
const tops = new Set(Object.keys(files).map((f) => f.split('/')[0]));
if (tops.size === 1 && Object.keys(files).every((f) => f.includes('/'))) {
  const [top] = tops;
  for (const f of Object.keys(files)) {
    files[f.slice(top.length + 1)] = files[f];
    delete files[f];
  }
}
if (component.executable && !files[component.executable]) {
  console.error(`L'exécutable ${component.executable} manque à la liste : archive inattendue.`);
  process.exit(1);
}
// Écrit dans le texte du manifeste, sans le resérialiser : le reste garde sa mise en forme.
const eol = text.includes('\r\n') ? '\r\n' : '\n';
const shaAt = text.indexOf(`"sha256": "${sha}"`);
const blockEnd = text.indexOf(`${eol}    }`, shaAt);
const anchor = /^( *)"executable(?:Pattern)?": .*,$/gm;
let insertAt = -1;
let indent = '      ';
for (let m; (m = anchor.exec(text)); ) {
  if (m.index > shaAt && m.index < blockEnd) {
    insertAt = m.index + m[0].length;
    indent = m[1];
  }
}
if (insertAt < 0) {
  console.error('Ligne « executable » introuvable dans le bloc du composant.');
  process.exit(1);
}
const sorted = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
const block = `${eol}${indent}"files": {${eol}${sorted.map(([f, n]) => `${indent}  ${JSON.stringify(f)}: ${n}`).join(`,${eol}`)}${eol}${indent}},`;
// Une description précédente du même bloc est remplacée.
let body = text;
const previous = new RegExp(`\\r?\\n *"files": \\{[^}]*\\},`).exec(text.slice(shaAt, blockEnd));
if (previous) body = text.slice(0, shaAt + previous.index) + text.slice(shaAt + previous.index + previous[0].length);
const at = previous && shaAt + previous.index < insertAt ? insertAt - previous[0].length : insertAt;
fs.writeFileSync(manifestFile, body.slice(0, at) + block + body.slice(at));
JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
console.log(`${component.name} ${component.version} : ${Object.keys(files).length} fichiers décrits.`);
