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
//
// Documents découpés (SPLITS, scripts/decoupage.mjs) : le sommaire et chaque rubrique sont
// comparés à leur traduction (la n-ième rubrique du sommaire français avec la n-ième du sommaire
// anglais) ; une rubrique absente du sommaire, ou écrite avec plusieurs phrases sur une ligne, est
// refusée. Nouveautés en attente (changements/*.md) : autant de points en français qu'en anglais,
// et pas de français dans les points anglais hors des libellés cités entre guillemets.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPrivate } from './audit-publication.mjs';
import { frenchOutsideQuotes } from './page-release.mjs';
import { reflow } from './phrases.mjs';
import { readmeDownloadProblems } from './telechargement-direct.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Chaque document français et sa traduction anglaise. */
export const PAIRS = [
  { fr: 'README.fr.md', en: 'README.md' },
  { fr: 'CHANGELOG.md', en: 'CHANGELOG.en.md' },
  { fr: 'docs/fonctionnalites.md', en: 'docs/features.md' },
  { fr: 'docs/manuel.md', en: 'docs/manual.md' },
  // Document interne (non publié) : vérifié quand il est là.
  { fr: 'interne/tests-manuels/tests-manuels.md', en: 'interne/tests-manuels/manual-tests.md' },
  { fr: 'docs/design-system/README.md', en: 'docs/design-system/README.en.md' },
];

/**
 * Documents découpés : un sommaire (le fichier) et ses rubriques (le dossier du même nom), une par
 * titre des niveaux `levels`. Libellés de la ligne de tête de chaque rubrique.
 */
export const SPLITS = [
  {
    fr: 'docs/manuel.md',
    en: 'docs/manual.md',
    levels: [2],
    labels: { fr: { self: 'Français', other: 'English', index: 'Sommaire du manuel' }, en: { self: 'English', other: 'Français', index: 'Manual contents' } },
  },
  {
    fr: 'interne/tests-manuels/tests-manuels.md',
    en: 'interne/tests-manuels/manual-tests.md',
    levels: [1, 2],
    labels: { fr: { self: 'Français', other: 'English', index: 'Sommaire des tests manuels' }, en: { self: 'English', other: 'Français', index: 'Manual tests contents' } },
  },
];

/** Rubriques d'un sommaire, dans l'ordre : titres « ## [Titre](dossier/rubrique.md) ». */
export function splitEntries(text) {
  const entries = [];
  let inFence = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{1,6}) \[(.+)\]\(([^)\s]+\.md)\)\s*$/.exec(line);
    if (m) entries.push({ level: m[1].length, title: m[2], file: decodeURI(m[3]) });
  }
  return entries;
}

/** Fichiers d'un document découpé, chemins relatifs au dépôt : le sommaire puis ses rubriques. */
export function splitFiles(summary, root = repo) {
  const full = path.join(root, summary);
  if (!fs.existsSync(full)) return [];
  return [summary, ...splitEntries(fs.readFileSync(full, 'utf8')).map((e) => path.posix.join(path.posix.dirname(summary), e.file))];
}

/** Texte entier d'un document découpé : sommaire et rubriques mis bout à bout. */
export function splitText(summary, root = repo) {
  return splitFiles(summary, root)
    .filter((f) => fs.existsSync(path.join(root, f)))
    .map((f) => fs.readFileSync(path.join(root, f), 'utf8'))
    .join('\n');
}

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
  return title.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim().toLowerCase().replace(/`/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
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

const texts = new Map();
function read(file) {
  if (!texts.has(file)) texts.set(file, fs.readFileSync(path.join(repo, file), 'utf8'));
  return texts.get(file);
}
const outlines = new Map();
function outlineOf(file) {
  if (!outlines.has(file)) outlines.set(file, outline(read(file)));
  return outlines.get(file);
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
    const anchors = dest === file ? doc.anchors : outlineOf(dest).anchors;
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

/** Numéros des tests manuels (« | 254 | … »), dans l'ordre du document. */
export function testNumbers(text) {
  return [...text.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1]));
}

/**
 * Tests manuels : chaque numéro une seule fois (deux sessions parallèles avaient pris 254 à
 * 256 le 25/10/2026), et les mêmes numéros dans le même ordre en français et en anglais.
 */
export function testNumberProblems(pair, frText, enText) {
  const problems = [];
  const fr = testNumbers(frText);
  const en = testNumbers(enText);
  for (const [file, numbers] of [[pair.fr, fr], [pair.en, en]]) {
    const twice = [...new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i))];
    if (twice.length) problems.push(`${file} : numéro${twice.length > 1 ? 's' : ''} de test en double : ${twice.join(', ')} (prendre le suivant libre : ${Math.max(...numbers) + 1})`);
  }
  const at = fr.findIndex((n, i) => n !== en[i]);
  if (at >= 0 || fr.length !== en.length) {
    const i = at >= 0 ? at : Math.min(fr.length, en.length);
    problems.push(`${pair.en} : test n° ${en[i] ?? 'absent'} à la place de ${fr[i] ?? 'rien'} (même ordre que ${pair.fr})`);
  }
  return problems;
}

/**
 * Un document découpé : ses rubriques deux à deux (même place dans les deux sommaires), aucune
 * rubrique hors du sommaire, une phrase par ligne, et pour les tests manuels leurs numéros.
 */
export function splitProblems(split) {
  const problems = [];
  if (!fs.existsSync(path.join(repo, split.fr))) return problems;
  const files = { fr: splitFiles(split.fr).slice(1), en: splitFiles(split.en).slice(1) };
  if (!files.fr.length) problems.push(`${split.fr} : pas de sommaire de rubriques (node scripts/decoupage.mjs --decouper)`);
  if (files.fr.length !== files.en.length) problems.push(`${split.en} : ${files.en.length} rubriques au sommaire, ${files.fr.length} dans ${split.fr} (même ordre dans les deux)`);
  for (let i = 0; i < Math.min(files.fr.length, files.en.length); i++) problems.push(...comparePair({ fr: files.fr[i], en: files.en[i] }));
  for (const lang of ['fr', 'en']) {
    const dir = split[lang].replace(/\.md$/, '');
    const listed = new Set(files[lang]);
    const onDisk = fs.existsSync(path.join(repo, dir)) ? fs.readdirSync(path.join(repo, dir)).filter((f) => f.endsWith('.md')).map((f) => `${dir}/${f}`) : [];
    for (const f of onDisk.filter((f) => !listed.has(f))) problems.push(`${f} : rubrique absente du sommaire ${split[lang]} (y ajouter « ## [Titre](${path.posix.basename(dir)}/${path.posix.basename(f)}) » à sa place)`);
    for (const f of [split[lang], ...files[lang]].filter((f) => fs.existsSync(path.join(repo, f)))) {
      const text = read(f);
      if (reflow(text) !== text) problems.push(`${f} : plusieurs phrases sur une ligne (node scripts/decoupage.mjs --phrases ${f})`);
    }
  }
  if (split.levels.includes(1)) problems.push(...testNumberProblems(split, splitText(split.fr), splitText(split.en)));
  return problems;
}

/** Dossier des nouveautés en attente, un fichier par branche (scripts/version-suivante.mjs). */
export const FRAGMENTS_DIR = 'changements';

/** Points d'un fichier de nouveautés en attente : { fr, en } (sections « ## Français » puis « ## English »). */
export function fragmentNotes(text) {
  const [, fr = '', en = ''] = text.replace(/\r\n/g, '\n').split(/^## (?:Français|English)\s*$/m);
  return { fr: bulletPoints(fr), en: bulletPoints(en) };
}

/** Fichiers de nouveautés en attente (chemins relatifs au dépôt), sans le mode d'emploi du dossier. */
export function fragmentFiles(root = repo) {
  const dir = path.join(root, FRAGMENTS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'LISEZMOI.md').sort().map((f) => `${FRAGMENTS_DIR}/${f}`);
}

/** Nouveautés en attente : des points dans les deux langues, en nombre égal, pas déjà publiés. */
export function fragmentProblems(root = repo) {
  const problems = [];
  const changelog = path.join(root, 'CHANGELOG.md');
  const published = new Set([...changelogSections(fs.existsSync(changelog) ? fs.readFileSync(changelog, 'utf8') : '').values()].flat());
  for (const file of fragmentFiles(root)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    if (!/^## Français\s*$/m.test(text) || !/^## English\s*$/m.test(text)) {
      problems.push(`${file} : sections « ## Français » puis « ## English » attendues`);
      continue;
    }
    const { fr, en } = fragmentNotes(text);
    if (!fr.length) problems.push(`${file} : aucun point « - » sous « ## Français »`);
    if (fr.length !== en.length) problems.push(`${file} : ${fr.length} point(s) en français, ${en.length} en anglais`);
    // La page de release commence par ces points anglais : du français y serait lu tel quel (ou
    // traduit de travers par le navigateur) par le public anglophone.
    for (const n of en.filter(frenchOutsideQuotes)) problems.push(`${file} : point anglais avec du français hors guillemets ; citer un libellé français entre "…" suivi de sa traduction (« ${n.slice(0, 60)} »)`);
    for (const n of fr.filter((n) => published.has(n))) problems.push(`${file} : point déjà publié dans CHANGELOG.md, à retirer (« ${n.slice(0, 60)} »)`);
  }
  return problems;
}

export function checkTranslations() {
  const problems = [];
  const tracked = execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
  const paired = new Set(PAIRS.flatMap((p) => [p.fr, p.en]));
  for (const split of SPLITS) for (const f of [...splitFiles(split.fr), ...splitFiles(split.en)]) paired.add(f);
  for (const file of tracked) {
    if (isPrivate(file) || paired.has(file) || file.startsWith(`${FRAGMENTS_DIR}/`) || UNTRANSLATED.some((re) => re.test(file))) continue;
    problems.push(`${file} : document publié sans traduction (ajoutez la paire à PAIRS dans scripts/traductions.mjs)`);
  }
  for (const pair of PAIRS.filter((p) => !isPrivate(p.fr) || fs.existsSync(path.join(repo, p.fr)))) problems.push(...comparePair(pair));
  for (const split of SPLITS) problems.push(...splitProblems(split));
  problems.push(...fragmentProblems());
  // Liens de téléchargement direct de la dernière version, en tête des deux README.
  problems.push(...readmeDownloadProblems(repo));
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
