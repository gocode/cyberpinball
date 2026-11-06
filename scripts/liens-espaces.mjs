// Liens des espaces de travail npm (node_modules\@cyberpinball\*) dans le dépôt lui-même.
//   node scripts/liens-espaces.mjs   -> lancé par npm run build (donc par npm test)
//
// Un worktree (.claude\worktrees\<nom>) n'a pas toujours son propre node_modules : Node et tsc
// remontent alors jusqu'à celui du dossier principal, dont les liens @cyberpinball\* pointent
// vers le code du dossier principal. app\ compilait et tournait donc contre le cœur du dossier
// principal, pas contre celui du worktree : deux exemplaires de packages/core en mémoire, un
// setLanguage('en') qui ne touchait pas celui de l'app (constaté le 06/11/2026 sur le test
// « Historique des parties »), des types et un code d'une autre branche.
//
// Le script pose, pour chaque espace de travail qui ne se résout pas dans le dépôt courant, une
// jonction node_modules\<nom> vers son dossier dans ce dépôt (permise par jonctions.test.ts :
// elle reste dans le dépôt). Les autres dépendances continuent de se résoudre en remontant
// (npm ci reste la façon d'installer). Il ne supprime jamais rien : un lien qui pointe ailleurs,
// ou un vrai dossier à la place du lien, est signalé et arrête la compilation.
// Garde-fou : packages/core/src/test/resolution-depot.test.ts.

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Les espaces de travail du dépôt : nom du paquet, dossier, emplacement du lien attendu. */
export function workspaces(root = repo) {
  const { workspaces: dirs = [] } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return dirs.map((dir) => {
    const full = path.join(root, dir);
    const { name } = JSON.parse(fs.readFileSync(path.join(full, 'package.json'), 'utf8'));
    return { name, dir: full, link: path.join(root, 'node_modules', ...name.split('/')) };
  });
}

function inside(child, parent) {
  const rel = path.relative(parent.toLowerCase(), child.toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Dossier réel où Node trouve `name` depuis `root` (null s'il ne le trouve pas). */
export function resolvedFrom(root, name) {
  try {
    const manifest = createRequire(path.join(root, 'package.json')).resolve(`${name}/package.json`);
    return fs.realpathSync(path.dirname(manifest));
  } catch {
    return null;
  }
}

/** Pose les jonctions manquantes ; renvoie ce qui a été fait, lève une erreur sur ce qu'il ne touche pas. */
export function ensureWorkspaceLinks(root = repo) {
  const done = [];
  const problems = [];
  for (const ws of workspaces(root)) {
    const expected = fs.realpathSync(ws.dir);
    let stat = null;
    try {
      stat = fs.lstatSync(ws.link);
    } catch {
      // absent : posé plus bas
    }
    if (stat?.isSymbolicLink()) {
      let target = null;
      try {
        target = fs.realpathSync(ws.link);
      } catch {
        // lien cassé
      }
      if (target && target.toLowerCase() === expected.toLowerCase()) continue;
      problems.push(`${path.relative(root, ws.link)} pointe vers ${target ?? fs.readlinkSync(ws.link)}, attendu ${path.relative(root, ws.dir)}. Retirez le lien (cmd /c rmdir "${ws.link}", sans /s, jamais sur sa cible) puis relancez.`);
      continue;
    }
    if (stat) {
      problems.push(`${path.relative(root, ws.link)} est un vrai dossier, pas un lien vers ${path.relative(root, ws.dir)} : réinstallez les dépendances par npm ci.`);
      continue;
    }
    const before = resolvedFrom(root, ws.name);
    fs.mkdirSync(path.dirname(ws.link), { recursive: true });
    fs.symlinkSync(expected, ws.link, 'junction');
    done.push(`${path.relative(root, ws.link)} -> ${path.relative(root, ws.dir)}${before && !inside(before, root) ? ` (se résolvait vers ${before})` : ''}`);
  }
  if (problems.length) throw new Error(`Liens des espaces de travail :\n  ${problems.join('\n  ')}`);
  return done;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const line of ensureWorkspaceLinks()) console.log(`lien d'espace de travail posé : ${line}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
