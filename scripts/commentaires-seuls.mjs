// Proof that a change only touches comments (translation of the comments, rewording).
//
//   node scripts/commentaires-seuls.mjs                      -> every changed file since the merge base with proto/ecrans
//   node scripts/commentaires-seuls.mjs --base <ref>          -> compared with another reference (commit, branch)
//   node scripts/commentaires-seuls.mjs <file|folder> [...]   -> only these files, or the changed files under these folders
//
// For each TypeScript or JavaScript file, the version of <base> and the working-tree version are
// compared twice, byte for byte:
//   1. compiled output without comments: ts.transpileModule with the options of the package's
//      tsconfig, plus removeComments (no source map, no declarations, which carry positions);
//   2. source reprinted without comments (ts.createPrinter, removeComments): stricter, it also
//      sees the types, which compilation erases.
// Any other changed file (HTML, CSS, Markdown...) is reported as not checkable, and the run fails:
// a comment-only branch touches nothing else, or lists it on purpose with explicit files.
// Exit code 0: same code everywhere; 1: a difference (file listed); 2: usage error.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Extensions whose code can be compared without comments. */
export const CHECKABLE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/i;

/** Compiler options of the nearest tsconfig.json, for the emit comparison (tsc defaults if none). */
const optionsCache = new Map();
function compilerOptionsFor(file, root = repo) {
  let dir = path.dirname(path.join(root, file));
  while (dir.startsWith(root)) {
    const config = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(config)) {
      if (!optionsCache.has(config)) {
        const read = ts.readConfigFile(config, ts.sys.readFile);
        optionsCache.set(config, read.error ? {} : ts.parseJsonConfigFileContent(read.config, ts.sys, dir).options);
      }
      return optionsCache.get(config);
    }
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return {};
}

function scriptKind(file) {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.(ts|mts|cts)$/i.test(file)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Compiled output without comments: what Node runs. */
export function emitWithoutComments(source, file, options = {}) {
  return ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: false,
    compilerOptions: { ...options, removeComments: true, sourceMap: false, inlineSourceMap: false, declaration: false, declarationMap: false, composite: false },
  }).outputText;
}

/** Source reprinted without comments, types included. */
export function printWithoutComments(source, file) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, scriptKind(file));
  return ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(sf);
}

/**
 * Compares two versions of a file. Returns undefined when only comments (and blank space)
 * differ, else the first stage that differs: 'emit' or 'types'.
 */
export function codeDifference(before, after, file, options = {}) {
  if (before === after) return undefined;
  if (emitWithoutComments(before, file, options) !== emitWithoutComments(after, file, options)) return 'emit';
  if (printWithoutComments(before, file) !== printWithoutComments(after, file)) return 'types';
  return undefined;
}

function git(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
}

function fileAt(ref, file) {
  try {
    return git(['show', `${ref}:${file}`]);
  } catch {
    return undefined;
  }
}

function main(argv) {
  let base;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') base = argv[++i];
    else if (argv[i].startsWith('--')) {
      console.error(`Unknown option: ${argv[i]}`);
      return 2;
    } else files.push(argv[i].replace(/\\/g, '/'));
  }
  base ??= git(['merge-base', 'HEAD', 'proto/ecrans']).trim();
  // A folder stands for the files changed under it.
  const changed = (where) => git(['diff', '--name-only', base, '--', ...where]).split('\n').map((f) => f.trim()).filter(Boolean);
  const folders = files.filter((f) => fs.existsSync(path.join(repo, f)) && fs.statSync(path.join(repo, f)).isDirectory());
  const list = !files.length ? changed([]) : [...files.filter((f) => !folders.includes(f)), ...(folders.length ? changed(folders) : [])];

  let compared = 0;
  const problems = [];
  for (const file of list) {
    if (!CHECKABLE.test(file)) {
      problems.push(`${file}: not a TypeScript or JavaScript file, cannot be checked`);
      continue;
    }
    const before = fileAt(base, file);
    const full = path.join(repo, file);
    const after = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : undefined;
    if (before === undefined || after === undefined) {
      problems.push(`${file}: ${before === undefined ? 'new file' : 'deleted file'}`);
      continue;
    }
    // Line endings: the working copy is CRLF, git may give LF; they are not code.
    const stage = codeDifference(before.replace(/\r\n/g, '\n'), after.replace(/\r\n/g, '\n'), file, compilerOptionsFor(file));
    compared++;
    if (stage === 'emit') problems.push(`${file}: compiled output differs`);
    else if (stage === 'types') problems.push(`${file}: code differs (types or syntax erased by compilation)`);
  }

  console.log(`Comments only: ${compared} file(s) compared with ${base.slice(0, 10)}, ${problems.length} problem(s).`);
  for (const p of problems) console.log(`  ${p}`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
