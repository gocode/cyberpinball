// Compilation TypeScript déjà faite sur ces sources : la publication ne la refait pas.
//
// Un tour du train compilait trois fois le même commit : contrôles express (scripts/controles.mjs),
// publier.mjs, puis fabriquer.mjs. Le marqueur tmp/compilation.json note l'arbre compilé avec
// succès ; publier.mjs et fabriquer.mjs sautent `tsc -b` si les sources n'ont pas bougé depuis.
//
// Réutilisable seulement si, depuis la compilation :
// - le dossier est propre (rien de modifié hors commit) ;
// - personne n'a recompilé ni effacé une compilation (date des tsconfig.tsbuildinfo identique) ;
// - aucun fichier TypeScript non suivi n'est apparu ou n'a disparu ;
// - l'arbre est le même, ou n'en diffère que par le commit « Version … » : numéro de package.json
//   et package-lock.json, CHANGELOG, changements/ (aucune source TypeScript ne les lit).
// Au moindre doute, on recompile : le marqueur est effacé avant chaque compilation et réécrit
// seulement après une compilation réussie.
//
// N'importe que des modules de Node : un train déjà lancé peut charger ce fichier à côté de ses
// anciens modules.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Les fichiers d'état de `tsc -b` (un par projet compilé). */
export const BUILDINFOS = ['app/tsconfig.tsbuildinfo', 'packages/core/tsconfig.tsbuildinfo', 'packages/installer/tsconfig.tsbuildinfo', 'packages/win-displays/tsconfig.tsbuildinfo'];
/** Ce que le commit « Version … » change, sans effet sur la compilation. */
const VERSION_ONLY = new Set(['CHANGELOG.md', 'CHANGELOG.en.md']);

const markerFile = (repo) => path.join(repo, 'tmp', 'compilation.json');

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

/** L'état des sources : arbre du commit (si le dossier est propre), compilations, fichiers TypeScript non suivis. */
function sourceState(repo) {
  const dirty = git(['status', '--porcelain', '--untracked-files=no'], repo);
  const arbre = dirty === '' ? git(['rev-parse', 'HEAD^{tree}'], repo) : undefined;
  const buildinfos = Object.fromEntries(BUILDINFOS.map((f) => {
    try {
      return [f, fs.statSync(path.join(repo, f)).mtimeMs];
    } catch {
      return [f, 0];
    }
  }));
  const untracked = (git(['ls-files', '--others', '--exclude-standard', '--', '*.ts', '*.tsx', '*.mts', '*.cts'], repo) ?? '?').split('\n').filter(Boolean).sort();
  return { arbre, buildinfos, untracked };
}

/** Avant une compilation : le marqueur ne vaut plus (une compilation ratée ne doit rien laisser). */
export function forgetCompilation(repo) {
  fs.rmSync(markerFile(repo), { force: true });
}

/** Après une compilation réussie : l'état des sources compilées. Dossier modifié : rien n'est noté. */
export function recordCompilation(repo) {
  const state = sourceState(repo);
  if (!state.arbre) return forgetCompilation(repo);
  fs.mkdirSync(path.dirname(markerFile(repo)), { recursive: true });
  const tmp = `${markerFile(repo)}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify({ ...state, date: new Date().toISOString() }, null, 2)}\n`);
    fs.renameSync(tmp, markerFile(repo));
  } catch {
    // Marqueur non écrit (fichier tenu un instant) : la prochaine publication recompilera, sans plus.
    fs.rmSync(tmp, { force: true });
    forgetCompilation(repo);
  }
}

/** package.json ou package-lock.json d'un arbre, sans ses numéros de version. */
function withoutVersion(repo, tree, file) {
  const text = git(['show', `${tree}:${file}`], repo);
  if (text === undefined) return undefined;
  try {
    const json = JSON.parse(text);
    delete json.version;
    if (json.packages?.['']) delete json.packages[''].version;
    return JSON.stringify(json);
  } catch {
    return undefined;
  }
}

/** Les deux arbres ne diffèrent que par ce que change un commit « Version … ». */
export function versionOnlyDiff(repo, from, to) {
  if (from === to) return true;
  const changed = git(['diff', '--name-only', '--no-renames', from, to], repo);
  if (changed === undefined) return false;
  for (const file of changed.split('\n').filter(Boolean)) {
    if (VERSION_ONLY.has(file) || file.startsWith('changements/')) continue;
    if (file === 'package.json' || file === 'package-lock.json') {
      const a = withoutVersion(repo, from, file);
      if (a !== undefined && a === withoutVersion(repo, to, file)) continue;
    }
    return false;
  }
  return true;
}

/** Rend la raison de réutiliser la compilation déjà faite, ou undefined s'il faut compiler. */
export function compilationReusable(repo) {
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerFile(repo), 'utf8'));
  } catch {
    return undefined;
  }
  const now = sourceState(repo);
  if (!marker.arbre || !now.arbre) return undefined;
  if (BUILDINFOS.some((f) => !marker.buildinfos?.[f] || marker.buildinfos[f] !== now.buildinfos[f])) return undefined;
  if (JSON.stringify(marker.untracked) !== JSON.stringify(now.untracked)) return undefined;
  if (!versionOnlyDiff(repo, marker.arbre, now.arbre)) return undefined;
  return marker.arbre === now.arbre ? `sources compilées le ${new Date(marker.date).toLocaleTimeString('fr-FR')}, inchangées` : `sources compilées le ${new Date(marker.date).toLocaleTimeString('fr-FR')} ; seul le numéro de version a changé depuis`;
}

/**
 * `tsc -b`, sauf si la compilation déjà faite vaut pour ces sources. `say` reçoit le saut ;
 * la compilation écrit sur la console (stdio hérité). Lance une erreur si la compilation échoue.
 */
export function compileOnce(repo, say = console.log) {
  const reason = compilationReusable(repo);
  if (reason) {
    say(`Compilation déjà faite (${reason}) : pas de nouvelle compilation.`);
    return false;
  }
  forgetCompilation(repo);
  const r = spawnSync(process.execPath, [path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), '-b'], { cwd: repo, stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) throw new Error(`la compilation TypeScript a échoué (code ${r.status ?? r.signal})`);
  recordCompilation(repo);
  return true;
}
