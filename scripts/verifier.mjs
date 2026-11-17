// Boucle de test courte, pendant le travail : seulement les tests utiles, sans l'audit de publication.
//   npm run verifier                       -> compile, puis tous les tests rapides (sans Electron ni Chromium)
//   npm run verifier -- puppack vbs        -> compile, puis les fichiers de test dont le nom contient un des motifs
//   npm run verifier -- --modifies         -> les tests qui importent ou citent un fichier changé depuis proto/ecrans
//   npm run verifier -- --base main --modifies -> idem, par rapport à une autre branche
//   npm run verifier -- --nom "garde-fou"  -> filtre aussi les tests par leur nom (--test-name-pattern)
//   npm run verifier -- --sans-build ...   -> sans recompiler
//   npm run test:electron                  -> seulement les tests lents : Electron, Chromium, processus lancés
//
// La suite complète reste `npm test`, une fois avant chaque préversion ; l'audit de publication
// (scripts/audit-publication.mjs) reste lancé par `npm run avant-fusion`, `npm run envoyer` et
// `npm run publier`. Mesure du 17/11/2026 : `npm test` durait environ 15 minutes et sessions le
// lançaient à chaque petite modification.
//
// Un fichier de test est « lent » s'il lance Electron, Chromium ou un autre processus, lui-même ou
// par un module d'aide du dossier des tests qu'il importe (clavier-reel-outils, electron-run…). Un
// test de scripts/ ne compte que par son propre texte : il importe le script testé, qui lance git ou tsc.
// Garde-fou : scripts/verifier.test.mjs.

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DIR = path.join(repo, 'packages', 'core', 'dist', 'test');
const SRC_TEST_DIR = path.join(repo, 'packages', 'core', 'src', 'test');
const SCRIPTS = path.join(repo, 'scripts');

/** Ce qui fait d'un module de test un test lent : lancer Electron, Chromium ou un autre processus. */
export const SLOW = /runElectron|require\.resolve\(['"]electron['"]|require\(['"]electron['"]\)|\bspawnSync\b|\bspawn\(|\bexecFileSync\b|\bexecSync\b|\bexecFile\(|\bfork\(/;

/** Modules locaux (même dossier) importés par un module compilé ou un script. */
export function localImports(text) {
  const found = new Set();
  for (const m of text.matchAll(/(?:require\(|from\s+|import\()\s*['"]\.\/([^'"]+)['"]/g)) found.add(m[1].replace(/\.(js|mjs|cjs)$/, ''));
  return [...found];
}

/**
 * Lents parmi `files` (noms de fichiers d'un même dossier) : un module est lent s'il correspond à
 * SLOW, ou s'il importe (de proche en proche, dans ce dossier) un module lent.
 * `read(name)` rend le texte du module `name` (sans extension), ou undefined s'il n'existe pas.
 */
export function slowFiles(files, read, { follow = true } = {}) {
  const memo = new Map();
  const isSlow = (name, seen) => {
    if (memo.has(name)) return memo.get(name);
    if (seen.has(name)) return false;
    seen.add(name);
    const text = read(name);
    const slow = text !== undefined && (SLOW.test(text) || (follow && localImports(text).some((dep) => isSlow(dep, seen))));
    memo.set(name, slow);
    return slow;
  };
  return new Set(files.filter((file) => isSlow(file.replace(/\.(js|mjs|cjs)$/, ''), new Set())));
}

/** Les fichiers de test qui importent ou citent un des fichiers changés (noms de base, sans extension). */
export function testsForChanges(changed, tests, sourceOf) {
  const bases = new Set();
  const direct = new Set();
  for (const file of changed) {
    const base = path.basename(file).replace(/\.(test\.)?(ts|tsx|js|mjs|cjs)$/, '');
    if (/\.test\.(ts|mjs)$/.test(file)) direct.add(base);
    else bases.add(base);
  }
  return tests.filter((test) => {
    const base = test.replace(/\.test\.(js|mjs)$/, '');
    if (direct.has(base)) return true;
    const text = sourceOf(test) ?? '';
    for (const b of bases) {
      const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`['"/]${escaped}(\\.(ts|js|mjs))?['"]|\\b${escaped}\\.(ts|js|mjs|css|html)\\b`).test(text)) return true;
    }
    return false;
  });
}

function parseArgs(argv) {
  const opts = { patterns: [], electron: false, modifies: false, build: true, base: 'proto/ecrans', name: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--electron') opts.electron = true;
    else if (a === '--modifies') opts.modifies = true;
    else if (a === '--sans-build') opts.build = false;
    else if (a === '--base') opts.base = argv[++i];
    else if (a === '--nom') opts.name = argv[++i];
    else opts.patterns.push(a.toLowerCase());
  }
  return opts;
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.build) {
    const run = spawnSync('npm run build', { cwd: repo, stdio: 'inherit', shell: true });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
  const core = fs.readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.js'));
  const scripts = fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.test.mjs'));
  const slowCore = slowFiles(core, (name) => readIfExists(path.join(TEST_DIR, `${name}.js`)));
  // Les tests des scripts importent les scripts eux-mêmes (qui lancent git, tsc…) : seul le test compte.
  const slowScripts = slowFiles(scripts, (name) => readIfExists(path.join(SCRIPTS, `${name}.mjs`)), { follow: false });
  const all = [
    ...core.map((f) => ({ name: f, file: path.join(TEST_DIR, f), slow: slowCore.has(f), source: () => readIfExists(path.join(SRC_TEST_DIR, f.replace(/\.js$/, '.ts'))) })),
    ...scripts.map((f) => ({ name: f, file: path.join(SCRIPTS, f), slow: slowScripts.has(f), source: () => readIfExists(path.join(SCRIPTS, f)) })),
  ];
  let chosen;
  if (opts.electron) chosen = all.filter((t) => t.slow && (!opts.patterns.length || opts.patterns.some((p) => t.name.toLowerCase().includes(p))));
  else if (opts.patterns.length) chosen = all.filter((t) => opts.patterns.some((p) => t.name.toLowerCase().includes(p)));
  else chosen = all.filter((t) => !t.slow);
  if (opts.modifies) {
    const diff = execFileSync('git', ['diff', '--name-only', `${opts.base}...HEAD`], { cwd: repo, encoding: 'utf8' });
    const status = execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: repo, encoding: 'utf8' });
    const changed = [...diff.split('\n'), ...status.split('\n').map((l) => l.slice(3))].map((l) => l.trim()).filter(Boolean);
    const names = new Set(testsForChanges(changed, all.map((t) => t.name), (name) => all.find((t) => t.name === name)?.source()));
    const base = opts.patterns.length || opts.electron ? chosen : all;
    chosen = base.filter((t) => names.has(t.name));
  }
  if (!chosen.length) {
    console.log('Aucun fichier de test ne correspond.');
    return;
  }
  const slow = chosen.filter((t) => t.slow).length;
  console.log(`${chosen.length} fichier(s) de test${slow ? `, dont ${slow} lent(s) (Electron, Chromium ou processus)` : ''}.`);
  const args = ['--test', ...(opts.name ? ['--test-name-pattern', opts.name] : []), ...chosen.map((t) => path.relative(repo, t.file))];
  const run = spawnSync(process.execPath, args, { cwd: repo, stdio: 'inherit' });
  process.exit(run.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
