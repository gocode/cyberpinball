// Flux de mise à jour d'essai pour docs\demo-lecture.ps1 : une version plus récente que celle du
// dépôt, avec les nouveautés réelles des dernières sections du CHANGELOG (bien plus longues que
// l'écran), signé par une clé d'essai faite ici. Cyber Pinball ne fait confiance à cette clé que
// dans un bac à sable (CYBERPINBALL_MAJ_CLE avec CYBERPINBALL_HOME, update.ts).
//   node docs\demo-lecture.cjs <dossier du site>   -> <dossier>\cyberpinball-maj.json, <dossier>\cle.pem
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { signManifest } = require('../packages/core/dist/update.js');

const site = process.argv[2];
fs.mkdirSync(site, { recursive: true });
const root = path.join(__dirname, '..');
const current = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

/** Sections « ## <version> » du CHANGELOG, chacune avec ses points. */
function sections(file) {
  const out = [];
  for (const line of fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/)) {
    if (line.startsWith('## ')) out.push({ notes: [] });
    else if (line.startsWith('- ') && out.length) out.at(-1).notes.push(line.slice(2));
  }
  return out;
}
const fr = sections('CHANGELOG.md');
const en = sections('CHANGELOG.en.md');
const [major, minor, patch] = current.split('-')[0].split('.').map(Number);
const versions = [`${major}.${minor}.${patch + 3}`, `${major}.${minor}.${patch + 2}`, `${major}.${minor}.${patch + 1}`];

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const asset = { name: 'CyberPinball-Setup.exe', url: 'http://127.0.0.1:1/absent.exe', size: 1, sha256: '0'.repeat(64) };
const manifest = {
  version: versions[0],
  date: new Date().toISOString(),
  notes: fr[0].notes,
  notesByLanguage: { en: en[0].notes },
  installer: asset,
  history: versions.slice(1).map((version, i) => ({ version, notes: fr[i + 1].notes, notesByLanguage: { en: en[i + 1].notes } })),
};
const envelope = signManifest(manifest, privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync(path.join(site, 'cyberpinball-maj.json'), JSON.stringify(envelope, null, 2));
fs.writeFileSync(path.join(site, 'cle.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
console.log(`Flux d'essai : ${versions[0]} (installée : ${current}), ${manifest.notes.length + manifest.history.reduce((n, h) => n + h.notes.length, 0)} points de nouveautés.`);
