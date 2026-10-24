// Documentation publiée en deux langues : chaque document français a sa traduction anglaise,
// tenue à jour section par section (le français reste la référence).
//   node scripts/traductions.mjs   -> lancé par npm test
//
// Refusés : un document publié (.md suivi par git, hors documents internes) sans traduction ni
// exemption ; une traduction absente ; une ligne de changement de langue qui manque en tête ;
// des titres qui ne se suivent pas au même niveau (section ajoutée d'un seul côté), un nombre
// différent de blocs de code ou de lignes de tableau ; une version de CHANGELOG.md sans son
// pendant, point par point, dans CHANGELOG.en.md ; un lien vers un fichier absent ou vers un
// titre (#ancre) qui n'existe pas.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPrivate } from './audit-publication.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Chaque document français et sa traduction anglaise. */
export const PAIRS = [
  { fr: 'README.fr.md', en: 'README.md' },
  { fr: 'CHANGELOG.md', en: 'CHANGELOG.en.md' },
  { fr: 'docs/manuel.md', en: 'docs/manual.md' },
  { fr: 'docs/tests-manuels.md', en: 'docs/manual-tests.md' },
  { fr: 'docs/design-system/README.md', en: 'docs/design-system/README.en.md' },
];

/** Documents publiés sans traduction : générés depuis des sources en français, ou notice de tiers. */
const UNTRANSLATED = [/^docs\/design-system\/components\/[^/]+\/README\.md$/, /^app\/renderer\/polices\/LISEZMOI\.md$/];

/** Points « - » d'un texte de nouveautés. */
export function bulletPoints(text) {
  return text.split(/\r?\n/).filter((l) => /^\s*[-*] /.test(l)).map((l) => l.replace(/^\s*[-*] /, '').trim());
}

/** Sections « ## <version> » d'un CHANGELOG : Map version -> points. */
export function changelogSections(text) {
  const sections = new Map();
  let current;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^## (\S+)/.exec(line);
    if (m) sections.set((current = m[1]), []);
    else if (current && /^\s*[-*] /.test(line)) sections.get(current).push(line.replace(/^\s*[-*] /, '').trim());
  }
  return sections;
}

/** Nouveautés d'une version dans un CHANGELOG ([] si le fichier ou la section manque). */
export function changelogNotes(file, version) {
  if (!fs.existsSync(file)) return [];
  return changelogSections(fs.readFileSync(file, 'utf8')).get(version) ?? [];
}

/** Ancre GitHub d'un titre : minuscules, ponctuation retirée, espaces en tirets. */
export function slug(title) {
  return title.trim().toLowerCase().replace(/`/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

/** Plan d'un document Markdown, hors blocs de code : titres, blocs de code, lignes de tableau, liens. */
export function outline(text) {
  const headings = [];
  const links = [];
  let fences = 0;
  let tableRows = 0;
  let inFence = false;
  text.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      if (!inFence) fences++;
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) headings.push({ level: h[1].length, title: h[2], line: i + 1 });
    if (/^\s*\|/.test(line)) tableRows++;
    for (const m of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)[^)]*\)/g)) links.push({ target: m[1], line: i + 1 });
  });
  const anchors = new Set();
  const seen = new Map();
  for (const h of headings) {
    const base = slug(h.title);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n ? `${base}-${n}` : base);
  }
  return { headings, fences, tableRows, links, anchors };
}

function read(file) {
  return fs.readFileSync(path.join(repo, file), 'utf8');
}

/** Liens d'un document vers un fichier absent ou un titre absent. */
function brokenLinks(file, doc) {
  const problems = [];
  for (const { target, line } of doc.links) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const [rel, anchor] = target.split('#');
    const dest = rel ? path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURI(rel))) : file;
    if (rel && !fs.existsSync(path.join(repo, dest))) {
      problems.push(`${file}:${line} : lien vers un fichier absent (${target})`);
      continue;
    }
    if (anchor === undefined || !/\.md$/i.test(dest)) continue;
    const anchors = dest === file ? doc.anchors : outline(read(dest)).anchors;
    if (!anchors.has(decodeURIComponent(anchor).toLowerCase())) problems.push(`${file}:${line} : lien vers un titre absent (${target})`);
  }
  return problems;
}

/** Écarts entre un document et sa traduction. */
export function comparePair(pair) {
  const problems = [];
  for (const file of [pair.fr, pair.en]) if (!fs.existsSync(path.join(repo, file))) problems.push(`${file} manque (traduction de ${file === pair.fr ? pair.en : pair.fr})`);
  if (problems.length) return problems;
  const fr = outline(read(pair.fr));
  const en = outline(read(pair.en));
  for (const [file, other] of [[pair.fr, pair.en], [pair.en, pair.fr]]) {
    const head = read(file).split(/\r?\n/).slice(0, 10).join('\n');
    const rel = path.posix.relative(path.posix.dirname(file), other);
    if (!head.includes(`](${rel})`)) problems.push(`${file} : pas de lien vers ${rel} dans ses 10 premières lignes (changement de langue)`);
  }
  const count = Math.max(fr.headings.length, en.headings.length);
  for (let i = 0; i < count; i++) {
    const a = fr.headings[i];
    const b = en.headings[i];
    if (a && b && a.level === b.level) continue;
    const show = (h, file) => (h ? `${file}:${h.line} ${'#'.repeat(h.level)} ${h.title}` : `${file} : rien`);
    problems.push(`titre n° ${i + 1} différent : ${show(a, pair.fr)} / ${show(b, pair.en)} (${fr.headings.length} titres en français, ${en.headings.length} en anglais)`);
    break;
  }
  if (fr.fences !== en.fences) problems.push(`${pair.en} : ${en.fences} blocs de code, ${fr.fences} dans ${pair.fr}`);
  if (fr.tableRows !== en.tableRows) problems.push(`${pair.en} : ${en.tableRows} lignes de tableau, ${fr.tableRows} dans ${pair.fr}`);
  if (/changelog/i.test(pair.fr)) {
    const a = changelogSections(read(pair.fr));
    const b = changelogSections(read(pair.en));
    for (const [version, notes] of a) {
      const other = b.get(version);
      if (!other) problems.push(`${pair.en} : pas de section « ## ${version} »`);
      else if (other.length !== notes.length) problems.push(`${pair.en} : ${other.length} points pour ${version}, ${notes.length} dans ${pair.fr}`);
    }
    for (const version of b.keys()) if (!a.has(version)) problems.push(`${pair.en} : section « ## ${version} » absente de ${pair.fr}`);
  }
  problems.push(...brokenLinks(pair.fr, fr), ...brokenLinks(pair.en, en));
  return problems;
}

export function checkTranslations() {
  const problems = [];
  const tracked = execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
  const paired = new Set(PAIRS.flatMap((p) => [p.fr, p.en]));
  for (const file of tracked) {
    if (isPrivate(file) || paired.has(file) || UNTRANSLATED.some((re) => re.test(file))) continue;
    problems.push(`${file} : document publié sans traduction (ajoutez la paire à PAIRS dans scripts/traductions.mjs)`);
  }
  for (const pair of PAIRS) problems.push(...comparePair(pair));
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkTranslations();
  if (problems.length) {
    console.error(`Traductions : ${problems.length} écart${problems.length > 1 ? 's' : ''} entre les documents et leur traduction :`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`Traductions : ${PAIRS.length} documents et leur traduction, mêmes sections, liens et ancres valides.`);
}
