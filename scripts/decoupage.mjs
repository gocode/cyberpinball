// Documents découpés : le manuel technique et les tests manuels tiennent en un fichier par
// rubrique, une phrase par ligne. Deux branches qui écrivent dans deux rubriques, ou dans deux
// phrases d'une même rubrique, ne se gênent plus à la fusion. Le sommaire (docs/manuel.md,
// docs/manual.md…) garde un titre par rubrique, donc les ancres des liens publics.
//   node scripts/decoupage.mjs --phrases <fichier…>  -> remet une phrase par ligne (npm test le vérifie)
//   node scripts/decoupage.mjs --reporter            -> dans une branche partie avant le découpage,
//        pendant la fusion de proto/ecrans (git merge en conflit) : reporte ses changements des
//        documents d'un seul tenant dans leurs rubriques, et ses nouveautés des CHANGELOG dans
//        changements/<branche>.md ; il reste à relire, git add, puis git commit
//   node scripts/decoupage.mjs --decouper            -> découpe les documents encore d'un seul tenant
//
// Le découpage est déterministe : le même document d'un seul tenant donne toujours les mêmes
// rubriques. C'est ce qui permet à --reporter de découper aussi l'ancêtre commun et la version de
// la branche, puis de fusionner rubrique par rubrique (git merge-file).

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reflow } from './phrases.mjs';
import { SPLITS, changelogSections, fragmentNotes, slug, splitEntries } from './traductions.mjs';
import { FRAGMENTS_DIR, fragmentText } from './version-suivante.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- Découpage d'un document ----------

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Titres d'une suite de lignes, hors blocs de code. */
function headingsOf(lines) {
  const found = [];
  let fence = null;
  lines.forEach((line, i) => {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) { if (f && f[1][0] === fence[0]) fence = null; return; }
    if (f) { fence = f[1]; return; }
    const h = HEADING.exec(line);
    if (h) found.push({ level: h[1].length, title: h[2], index: i });
  });
  return found;
}

/** Tête (avant la première rubrique) et rubriques d'un document d'un seul tenant. */
export function splitParts(text, levels) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const cuts = headingsOf(lines).filter((h) => levels.includes(h.level));
  const head = lines.slice(0, cuts[0]?.index ?? lines.length);
  const parts = cuts.map((h, k) => ({ level: h.level, title: h.title, lines: lines.slice(h.index, cuts[k + 1]?.index ?? lines.length) }));
  return { head, parts };
}

/** Nom de fichier d'une rubrique : son titre en minuscules sans accents, quelques mots. */
export function fileSlug(title) {
  const s = title
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let name = '';
  for (const w of s.split('-')) {
    if (name && `${name}-${w}`.length > 48) break;
    name = name ? `${name}-${w}` : w;
  }
  return name || 'rubrique';
}

function uniqueNames(parts) {
  const used = new Set();
  return parts.map((p) => {
    const base = fileSlug(p.title);
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
    used.add(name);
    return name;
  });
}

/** Ancres d'un document d'un seul tenant -> rubrique (-1 : la tête) et ancre dans le fichier de la rubrique. */
function anchorMap(doc) {
  const map = new Map();
  const whole = new Map();
  const add = (seen, title) => {
    const base = slug(title);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
  const headSeen = new Map();
  for (const h of headingsOf(doc.head)) map.set(add(whole, h.title), { part: -1, local: add(headSeen, h.title) });
  doc.parts.forEach((p, part) => {
    const seen = new Map();
    for (const h of headingsOf(p.lines)) map.set(add(whole, h.title), { part, local: add(seen, h.title) });
  });
  return map;
}

/** Remplace la cible des liens Markdown d'une ligne, hors code. */
function rewriteLinks(line, fn) {
  return line.replace(/(`+)[^`]*?\1|\]\(([^)\s]+)/g, (m, ticks, target) => (ticks ? m : `](${fn(target)}`));
}

const encodeAnchor = (local, original) => (original.includes('%') ? encodeURIComponent(local) : local);

/**
 * Fichiers d'un document découpé, d'après ses deux versions d'un seul tenant :
 * Map chemin (relatif au dépôt, « / ») -> texte. `split` : une entrée de SPLITS.
 */
export function splitDocument(split, frText, enText) {
  const langs = {
    fr: { file: split.fr, doc: splitParts(frText, split.levels) },
    en: { file: split.en, doc: splitParts(enText, split.levels) },
  };
  if (langs.fr.doc.parts.length !== langs.en.doc.parts.length) {
    throw new Error(`${split.fr} : ${langs.fr.doc.parts.length} rubriques, ${split.en} : ${langs.en.doc.parts.length} ; à aligner avant de découper`);
  }
  for (const l of Object.values(langs)) {
    l.dir = l.file.replace(/\.md$/, '');
    l.names = uniqueNames(l.doc.parts);
    l.anchors = anchorMap(l.doc);
    l.path = (part) => `${l.dir}/${l.names[part]}.md`;
  }
  const out = new Map();
  for (const [code, other] of [['fr', 'en'], ['en', 'fr']]) {
    const l = langs[code];
    const o = langs[other];
    const label = split.labels[code];
    // Un lien du document d'un seul tenant, réécrit depuis `from` (chemin du nouveau fichier).
    const target = (from, t) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
      const [rel, anchor] = t.split('#');
      const dest = rel ? path.posix.normalize(path.posix.join(path.posix.dirname(l.file), decodeURI(rel))) : l.file;
      const into = dest === l.file ? l : dest === o.file ? o : undefined;
      if (into && anchor !== undefined) {
        const hit = into.anchors.get(decodeURIComponent(anchor).toLowerCase());
        if (hit) {
          const file = hit.part < 0 ? into.file : into.path(hit.part);
          const local = encodeAnchor(hit.local, anchor);
          return file === from ? `#${local}` : `${path.posix.relative(path.posix.dirname(from), file)}#${local}`;
        }
      }
      if (!rel) return t;
      const back = path.posix.relative(path.posix.dirname(from), dest) || path.posix.basename(dest);
      return anchor === undefined ? back : `${back}#${anchor}`;
    };
    const fix = (from, lines) => {
      let fence = null;
      return lines.map((line) => {
        const f = /^\s*(`{3,}|~{3,})/.exec(line);
        if (fence) { if (f && f[1][0] === fence[0]) fence = null; return line; }
        if (f) { fence = f[1]; return line; }
        return rewriteLinks(line, (t) => target(from, t));
      });
    };
    const trim = (lines) => {
      const copy = [...lines];
      while (copy.length && !copy.at(-1).trim()) copy.pop();
      return copy;
    };
    l.doc.parts.forEach((p, k) => {
      const file = l.path(k);
      const counterpart = path.posix.relative(path.posix.dirname(file), o.path(k));
      const index = path.posix.relative(path.posix.dirname(file), l.file);
      const header = `[${label.other}](${counterpart}) · ${label.self} · [${label.index}](${index})`;
      out.set(file, `${reflow([header, '', ...trim(fix(file, p.lines))].join('\n'))}\n`);
    });
    const entries = l.doc.parts.map((p, k) => `${'#'.repeat(p.level)} [${p.title}](${path.posix.relative(path.posix.dirname(l.file), l.path(k))})`);
    out.set(l.file, `${reflow([...trim(fix(l.file, l.doc.head)), '', ...entries].join('\n'))}\n`);
  }
  return out;
}

// ---------- Fichiers ----------

// Dossier du dépôt traité : celui de ce script, ou un autre pour les tests (splitAll, carryOver).
let here = repo;
const git = (args, opts = {}) => execFileSync('git', args, { cwd: here, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
const toDisk = (text) => text.replace(/\r?\n/g, '\r\n');
const fromDisk = (text) => text.replace(/\r\n/g, '\n');
function writeText(rel, text) {
  const full = path.join(here, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, toDisk(text));
}

/** Un document est-il encore d'un seul tenant (pas de sommaire) ? */
const isWhole = (text) => !splitEntries(text).length;

/** Découpe les documents encore d'un seul tenant (sommaire réécrit, rubriques écrites). */
export function splitAll(dir = repo) {
  here = dir;
  const done = [];
  for (const split of SPLITS) {
    const fr = path.join(here, split.fr);
    if (!fs.existsSync(fr)) continue;
    const frText = fromDisk(fs.readFileSync(fr, 'utf8'));
    if (!isWhole(frText)) continue;
    const enText = fromDisk(fs.readFileSync(path.join(here, split.en), 'utf8'));
    const files = splitDocument(split, frText, enText);
    for (const [rel, text] of files) writeText(rel, text);
    done.push(`${split.fr} et ${split.en} : ${(files.size - 2) / 2} rubriques par langue`);
  }
  return done;
}

/**
 * Liens des autres documents vers une ancre d'un document découpé : dirigés vers sa rubrique.
 * `maps` : pour chaque document découpé, Map ancre d'origine -> chemin de rubrique et ancre.
 */
export function redirectLinks(file, text, maps) {
  return text.split('\n').map((line) => rewriteLinks(line, (t) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
    const [rel, anchor] = t.split('#');
    if (!rel || anchor === undefined) return t;
    const dest = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURI(rel)));
    const hit = maps.get(dest)?.get(decodeURIComponent(anchor).toLowerCase());
    if (!hit) return t;
    return `${path.posix.relative(path.posix.dirname(file), hit.file)}#${encodeAnchor(hit.local, anchor)}`;
  })).join('\n');
}

/** Pour chaque document d'un seul tenant : ancre -> fichier de rubrique et ancre locale. */
export function anchorTargets(split, text, lang) {
  const doc = splitParts(text, split.levels);
  const dir = split[lang].replace(/\.md$/, '');
  const names = uniqueNames(doc.parts);
  const map = new Map();
  for (const [anchor, hit] of anchorMap(doc)) if (hit.part >= 0) map.set(anchor, { file: `${dir}/${names[hit.part]}.md`, local: hit.local });
  return map;
}

// ---------- Report d'une branche partie avant le découpage ----------

function show(ref, file) {
  try {
    return fromDisk(git(['show', `${ref}:${file}`], { stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return undefined;
  }
}

/** Fusion à trois de textes (git merge-file) : { text, conflicts }. */
function mergeThree(ours, base, theirs, labels) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-decoupage-'));
  try {
    const files = ['ours', 'base', 'theirs'].map((n) => path.join(dir, n));
    [ours, base, theirs].forEach((t, i) => fs.writeFileSync(files[i], t));
    try {
      return { text: git(['merge-file', '-p', '-L', labels[0], '-L', labels[1], '-L', labels[2], ...files]), conflicts: 0 };
    } catch (error) {
      if (typeof error.status === 'number' && error.status > 0 && error.stdout !== undefined) return { text: String(error.stdout), conflicts: error.status };
      throw error;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Rubriques d'un sommaire du disque : titre -> chemin. */
function currentEntries(split, lang) {
  const file = path.join(here, split[lang]);
  if (!fs.existsSync(file)) return [];
  return splitEntries(fs.readFileSync(file, 'utf8')).map((e) => ({ ...e, path: path.posix.join(path.posix.dirname(split[lang]), e.file) }));
}

/**
 * Reporte, pendant la fusion de proto/ecrans dans une branche partie avant le découpage, ce que la
 * branche a changé dans les documents d'un seul tenant : rubrique par rubrique, en fusion à trois
 * (ancêtre commun découpé, branche découpée, rubrique de proto/ecrans). Une rubrique ajoutée par
 * la branche rejoint le sommaire après sa voisine. Rend la liste de ce qui a été fait.
 */
export function carryOver(dir = repo) {
  here = dir;
  const report = [];
  let mergeHead;
  try {
    mergeHead = git(['rev-parse', '-q', '--verify', 'MERGE_HEAD']).trim();
  } catch {
    throw new Error('aucune fusion en cours : lancez d’abord « git merge proto/ecrans », puis ce script sur ses conflits.');
  }
  const base = git(['merge-base', 'HEAD', mergeHead]).trim();
  for (const split of SPLITS) {
    const ours = { fr: show('HEAD', split.fr), en: show('HEAD', split.en) };
    const anc = { fr: show(base, split.fr), en: show(base, split.en) };
    if (!ours.fr || !anc.fr || !isWhole(ours.fr)) continue;
    if (ours.fr === anc.fr && ours.en === anc.en) {
      // La branche n'a pas touché à ce document : la version découpée de proto/ecrans s'impose.
      git(['checkout', mergeHead, '--', split.fr, split.en]);
      report.push(`${split.fr} : inchangé dans la branche, sommaire de proto/ecrans repris`);
      continue;
    }
    const filesOf = (pair) => {
      try {
        return splitDocument(split, pair.fr, pair.en ?? pair.fr);
      } catch {
        // Traduction en retard dans la branche : chaque langue découpée seule.
        const one = (lang) => splitDocument(split, pair[lang], pair[lang]);
        return new Map([...[...one('fr')].filter(([f]) => f.startsWith(split.fr.replace(/\.md$/, '/'))), ...[...one('en')].filter(([f]) => f.startsWith(split.en.replace(/\.md$/, '/')))]);
      }
    };
    const oursFiles = filesOf(ours);
    const baseFiles = filesOf(anc);
    // Sommaires : ceux de proto/ecrans, complétés plus bas des rubriques nouvelles de la branche.
    git(['checkout', mergeHead, '--', split.fr, split.en]);
    for (const lang of ['fr', 'en']) {
      const dir = split[lang].replace(/\.md$/, '');
      const entries = currentEntries(split, lang);
      const byTitle = new Map(entries.map((e) => [e.title, e.path]));
      const byName = new Map(entries.map((e) => [path.posix.basename(e.path), e.path]));
      const oursParts = splitParts(ours[lang] ?? '', split.levels).parts;
      const baseParts = splitParts(anc[lang] ?? '', split.levels).parts;
      const oursNames = uniqueNames(oursParts);
      const baseNames = uniqueNames(baseParts);
      const added = [];
      oursParts.forEach((p, k) => {
        const name = `${oursNames[k]}.md`;
        const mine = oursFiles.get(`${dir}/${name}`);
        // La même rubrique dans l'ancêtre : même titre, sinon même place quand le nombre de rubriques n'a pas changé.
        let b = baseParts.findIndex((q) => q.title === p.title);
        if (b < 0 && baseParts.length === oursParts.length) b = k;
        const theirsPath = byTitle.get(p.title) ?? (b >= 0 ? byTitle.get(baseParts[b].title) ?? byName.get(`${baseNames[b]}.md`) : undefined) ?? byName.get(name);
        const old = b >= 0 ? baseFiles.get(`${dir}/${baseNames[b]}.md`) : undefined;
        if (old !== undefined && old === mine) return;
        if (!theirsPath || !fs.existsSync(path.join(here, theirsPath))) {
          if (b >= 0 && old !== undefined) {
            report.push(`${dir}/${name} : rubrique changée dans la branche mais retirée de proto/ecrans ; à reporter à la main`);
            return;
          }
          writeText(`${dir}/${name}`, mine);
          added.push({ after: k > 0 ? oursParts[k - 1].title : undefined, line: `${'#'.repeat(p.level)} [${p.title}](${path.posix.basename(dir)}/${name})` });
          report.push(`${dir}/${name} : rubrique nouvelle de la branche, ajoutée au sommaire`);
          return;
        }
        const theirs = fromDisk(fs.readFileSync(path.join(here, theirsPath), 'utf8'));
        const merged = mergeThree(mine, old ?? '', theirs, ['branche', 'ancêtre', 'proto/ecrans']);
        writeText(theirsPath, merged.text);
        report.push(`${theirsPath} : ${merged.conflicts ? `${merged.conflicts} conflit(s) à résoudre (marques <<<<<<<)` : 'changements de la branche reportés'}`);
      });
      if (added.length) {
        const file = path.join(here, split[lang]);
        const lines = fromDisk(fs.readFileSync(file, 'utf8')).split('\n');
        for (const a of added) {
          const at = a.after ? lines.findIndex((l) => l.includes(`[${a.after}](`)) : -1;
          if (at >= 0) lines.splice(at + 1, 0, a.line);
          else lines.splice(lines.findLastIndex((l) => l.trim()) + 1, 0, a.line);
        }
        writeText(split[lang], lines.join('\n'));
      }
    }
  }
  report.push(...carryOverChangelog(base, mergeHead));
  return report;
}

/** Nouveautés écrites par la branche dans les CHANGELOG : déplacées dans changements/<branche>.md. */
function carryOverChangelog(base, mergeHead) {
  const added = (file) => {
    const before = new Set([...changelogSections(show(base, file) ?? '').values()].flat());
    return [...changelogSections(show('HEAD', file) ?? '').values()].flat().filter((n) => !before.has(n));
  };
  const fr = added('CHANGELOG.md');
  const en = added('CHANGELOG.en.md');
  if (!fr.length && !en.length) return [];
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim().split('/').pop();
  const rel = `${FRAGMENTS_DIR}/${branch}.md`;
  const full = path.join(here, rel);
  const kept = fs.existsSync(full) ? fromDisk(fs.readFileSync(full, 'utf8')) : '';
  const prior = kept ? fragmentNotes(kept) : { fr: [], en: [] };
  writeText(rel, fragmentText([...fr, ...prior.fr.filter((n) => !fr.includes(n))], [...en, ...prior.en.filter((n) => !en.includes(n))]));
  git(['checkout', mergeHead, '--', 'CHANGELOG.md', 'CHANGELOG.en.md']);
  return [`${rel} : ${fr.length} nouveauté(s) en français, ${en.length} en anglais, retirées des CHANGELOG (pris de proto/ecrans)`];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  // Le dépôt du dossier courant (le worktree de la branche), quel que soit l'endroit d'où vient ce script.
  const top = () => path.resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  try {
    if (argv[0] === '--phrases') {
      for (const rel of argv.slice(1)) {
        const full = path.resolve(rel);
        const text = fs.readFileSync(full, 'utf8');
        const next = reflow(text);
        if (next !== text) fs.writeFileSync(full, next);
        console.log(`${rel} : ${next === text ? 'déjà une phrase par ligne' : 'une phrase par ligne'}`);
      }
    } else if (argv[0] === '--decouper') {
      const done = splitAll(top());
      console.log(done.length ? done.join('\n') : 'Rien à découper : les documents ont déjà leur sommaire.');
    } else if (argv[0] === '--reporter') {
      const done = carryOver(top());
      console.log(done.join('\n'));
      console.log('\nÀ relire (git diff), puis : git add -A docs interne changements CHANGELOG.md CHANGELOG.en.md, et git commit pour finir la fusion.');
    } else {
      console.log('node scripts/decoupage.mjs --phrases <fichier…> | --reporter | --decouper');
    }
  } catch (error) {
    console.error(`Découpage : ${error.message}`);
    process.exit(1);
  }
}
