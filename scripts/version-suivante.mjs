// Passe à la version suivante : package.json, package-lock.json, et une section vide
// « ## <version> » en tête de CHANGELOG.md et de CHANGELOG.en.md, à remplir (une ligne « - »
// par point, autant en anglais qu'en français : npm test le vérifie).
//   node scripts/version-suivante.mjs            -> 0.1.1 devient 0.1.2
//   node scripts/version-suivante.mjs mineure    -> 0.1.1 devient 0.2.0
//   node scripts/version-suivante.mjs majeure    -> 0.1.1 devient 1.0.0
//   node scripts/version-suivante.mjs --verifier -> les nouveautés de la version actuelle sont-elles écrites ?
// Rien n'est enregistré dans git ici : le lanceur (action « version ») le fait une fois les
// nouveautés écrites.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogSections } from './traductions.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgFile = path.join(repo, 'package.json');
const lockFile = path.join(repo, 'package-lock.json');
const changelogs = [path.join(repo, 'CHANGELOG.md'), path.join(repo, 'CHANGELOG.en.md')];

const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const arg = process.argv[2];

function notesOf(file, version) {
  return changelogSections(fs.readFileSync(file, 'utf8')).get(version) ?? [];
}

if (arg === '--verifier') {
  const [fr, en] = changelogs.map((f) => notesOf(f, pkg.version));
  const problems = [];
  if (!fr.length) problems.push(`aucune nouveauté pour ${pkg.version} dans CHANGELOG.md`);
  if (fr.length !== en.length) problems.push(`${fr.length} point(s) en français, ${en.length} en anglais (CHANGELOG.en.md)`);
  if (problems.length) {
    console.error(`Version ${pkg.version} : ${problems.join(' ; ')}.`);
    process.exit(1);
  }
  console.log(`Version ${pkg.version} : ${fr.length} nouveauté(s), en français et en anglais.`);
  process.exit(0);
}

const parts = pkg.version.split(/[.-]/).slice(0, 3).map(Number);
if (parts.some((n) => !Number.isInteger(n))) throw new Error(`Version illisible : ${pkg.version}`);
const [major, minor, patch] = parts;
const next = arg === 'majeure' ? `${major + 1}.0.0` : arg === 'mineure' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;

pkg.version = next;
fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
if (fs.existsSync(lockFile)) {
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  fs.writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
}

// Section vide juste avant la plus récente (ou en fin de fichier s'il n'y en a pas).
for (const file of changelogs) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  if (!new RegExp(`^## ${next.replace(/\./g, '\\.')}\\b`, 'm').test(text)) {
    const at = text.search(/^## /m);
    const section = `## ${next}\n\n`;
    text = at >= 0 ? text.slice(0, at) + section + text.slice(at) : `${text.replace(/\n*$/, '\n\n')}${section}`;
  }
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
}
console.log(`Version ${next} : écrivez ses nouveautés sous « ## ${next} » dans CHANGELOG.md et CHANGELOG.en.md (une ligne « - » par point).`);
