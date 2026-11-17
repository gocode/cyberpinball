// Numéro de version et nouveautés. Une branche n'y touche jamais : elle écrit ses nouveautés dans
// changements/<branche>.md (« ## Français » puis « ## English », une ligne « - » par point, autant
// dans les deux langues : npm test le vérifie). La publication (scripts/publier.mjs --essai…) pose
// le numéro, rassemble ces fichiers dans CHANGELOG.md et CHANGELOG.en.md, les retire et enregistre
// le commit « Version … ». Ce script fait la même chose sans publier :
//   node scripts/version-suivante.mjs            -> 0.1.1 devient 0.1.2
//   node scripts/version-suivante.mjs mineure    -> 0.1.1 devient 0.2.0
//   node scripts/version-suivante.mjs majeure    -> 0.1.1 devient 1.0.0
//   node scripts/version-suivante.mjs essai      -> préversion d'essai : 0.1.1 devient 0.1.2-essai.1,
//                                                   0.1.2-essai.1 devient 0.1.2-essai.2 ; ses nouveautés
//                                                   vont sous « ## 0.1.2 » (la version finale)
//   (depuis une préversion, le correctif est sa version finale : 0.1.2-essai.2 devient 0.1.2)
//   node scripts/version-suivante.mjs --verifier -> les nouveautés de la version (ou en attente) sont-elles écrites ?
// Rien n'est enregistré dans git ici : le lanceur (action « version ») le fait une fois les
// nouveautés relues.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAGMENTS_DIR, changelogSections, fragmentFiles, fragmentNotes, fragmentProblems } from './traductions.mjs';

export { FRAGMENTS_DIR };

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOGS = { fr: 'CHANGELOG.md', en: 'CHANGELOG.en.md' };

/** Une préversion (0.1.2-essai.1) écrit ses nouveautés sous sa version finale (## 0.1.2). */
export const notesVersion = (version) => version.replace(/-.*$/, '');

/** Version suivante d'une version : `kind` = correctif (par défaut), mineure, majeure ou essai. */
export function nextVersion(current, kind = 'correctif') {
  const parts = current.split(/[.-]/).slice(0, 3).map(Number);
  if (parts.some((n) => !Number.isInteger(n))) throw new Error(`Version illisible : ${current}`);
  const [major, minor, patch] = parts;
  const essai = /-essai\.(\d+)$/.exec(current);
  const isPre = current.includes('-');
  if (kind === 'majeure') return `${major + 1}.0.0`;
  if (kind === 'mineure') return `${major}.${minor + 1}.0`;
  if (kind === 'essai') return essai ? `${major}.${minor}.${patch}-essai.${Number(essai[1]) + 1}` : `${major}.${minor}.${isPre ? patch : patch + 1}-essai.1`;
  if (kind === 'correctif' || kind === undefined) return `${major}.${minor}.${isPre ? patch : patch + 1}`;
  throw new Error(`Sorte de version inconnue : ${kind} (correctif, mineure, majeure ou essai)`);
}

/** Version de package.json. */
export function currentVersion(root = repo) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
}

/** Pose la version dans package.json et package-lock.json. */
export function applyVersion(version, root = repo) {
  const pkgFile = path.join(root, 'package.json');
  const lockFile = path.join(root, 'package-lock.json');
  const keepEol = (file, text) => (fs.readFileSync(file, 'utf8').includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgFile, keepEol(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`));
  if (fs.existsSync(lockFile)) {
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    fs.writeFileSync(lockFile, keepEol(lockFile, `${JSON.stringify(lock, null, 2)}\n`));
  }
}

/** Texte d'un fichier de nouveautés en attente. */
export function fragmentText(fr, en) {
  return ['## Français', '', ...fr.map((n) => `- ${n}`), '', '## English', '', ...en.map((n) => `- ${n}`), ''].join('\n');
}

/**
 * Rassemble les nouveautés en attente (changements/*.md) en tête de la section « ## <section> »
 * des deux CHANGELOG (créée au besoin, avant la plus récente), et retire leurs fichiers.
 * Rend { files, fr, en } : fichiers rassemblés et nombre de points par langue.
 */
export function foldFragments(section, root = repo) {
  const problems = fragmentProblems(root);
  if (problems.length) throw new Error(`nouveautés en attente à corriger d'abord :\n  ${problems.join('\n  ')}`);
  const files = fragmentFiles(root);
  const notes = { fr: [], en: [] };
  for (const file of files) {
    const { fr, en } = fragmentNotes(fs.readFileSync(path.join(root, file), 'utf8'));
    notes.fr.push(...fr);
    notes.en.push(...en);
  }
  for (const [lang, name] of Object.entries(CHANGELOGS)) {
    const file = path.join(root, name);
    const raw = fs.readFileSync(file, 'utf8');
    const crlf = raw.includes('\r\n');
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    let at = lines.findIndex((l) => new RegExp(`^## ${section.replace(/\./g, '\\.')}\\s*$`).test(l));
    if (at < 0) {
      // Section neuve, juste avant la plus récente (ou en fin de fichier s'il n'y en a pas).
      const first = lines.findIndex((l) => /^## /.test(l));
      const insert = first >= 0 ? first : lines.length;
      lines.splice(insert, 0, `## ${section}`, '');
      at = insert;
    }
    if (notes[lang].length) {
      // En tête de la section : la plus récente d'abord, comme les points déjà écrits.
      let start = at + 1;
      while (start < lines.length && !lines[start].trim()) start++;
      const next = lines[start] ?? '';
      const points = notes[lang].map((n) => `- ${n}`);
      if (/^## /.test(next) || start >= lines.length) lines.splice(at + 1, start - at - 1, '', ...points, '');
      else lines.splice(start, 0, ...points);
    }
    const text = lines.join('\n');
    fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
  }
  for (const file of files) fs.rmSync(path.join(root, file));
  return { files, fr: notes.fr.length, en: notes.en.length };
}

/** Points de la version (ou, pour une préversion, de sa version finale) dans un CHANGELOG. */
function notesOf(name, version, root = repo) {
  const sections = changelogSections(fs.readFileSync(path.join(root, name), 'utf8'));
  return sections.get(version)?.length ? sections.get(version) : sections.get(notesVersion(version)) ?? [];
}

/** Les nouveautés de la version actuelle, ou en attente, sont écrites dans les deux langues. */
export function verify(root = repo) {
  const version = currentVersion(root);
  const pending = fragmentFiles(root);
  const fragments = fragmentProblems(root);
  if (fragments.length) return { ok: false, message: `Nouveautés en attente : ${fragments.join(' ; ')}.` };
  if (pending.length) return { ok: true, message: `${pending.length} fichier(s) de nouveautés en attente (${FRAGMENTS_DIR}/), rassemblés dans les CHANGELOG à la publication.` };
  const fr = notesOf(CHANGELOGS.fr, version, root);
  const en = notesOf(CHANGELOGS.en, version, root);
  if (version.includes('-') && !fr.length && !en.length) return { ok: true, message: `Préversion ${version} sans nouveautés : la release dira « Préversion d'essai de la ${notesVersion(version)} ».` };
  const problems = [];
  if (!fr.length) problems.push(`aucune nouveauté pour ${version} dans CHANGELOG.md ni dans ${FRAGMENTS_DIR}/`);
  if (fr.length !== en.length) problems.push(`${fr.length} point(s) en français, ${en.length} en anglais (CHANGELOG.en.md)`);
  if (problems.length) return { ok: false, message: `Version ${version} : ${problems.join(' ; ')}.` };
  return { ok: true, message: `Version ${version} : ${fr.length} nouveauté(s), en français et en anglais.` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  try {
    if (arg === '--verifier') {
      const { ok, message } = verify();
      (ok ? console.log : console.error)(message);
      process.exit(ok ? 0 : 1);
    }
    const next = nextVersion(currentVersion(), arg);
    const section = notesVersion(next);
    applyVersion(next);
    const folded = foldFragments(section);
    console.log(`Version ${next} : ${folded.files.length ? `${folded.fr} nouveauté(s) de ${folded.files.length} fichier(s) de ${FRAGMENTS_DIR}/ rassemblée(s)` : 'aucune nouveauté en attente'} sous « ## ${section} » de CHANGELOG.md et CHANGELOG.en.md (à relire).`);
  } catch (error) {
    console.error(`Version suivante : ${error.message}`);
    process.exit(1);
  }
}
