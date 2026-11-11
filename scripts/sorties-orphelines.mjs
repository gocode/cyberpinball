// Retire de dist\ les fichiers compilés dont la source a disparu.
//   node scripts/sorties-orphelines.mjs              -> lancé par npm run build (donc par npm test)
//   node scripts/sorties-orphelines.mjs --verifier   -> liste sans rien retirer (code 1 s'il y en a)
//
// tsc -b compile src\ vers dist\ mais n'efface jamais ce qu'il a produit pour un fichier
// supprimé ou renommé depuis. Un test retiré restait donc dans dist\test\ et npm test, qui lance
// dist\test\*.test.js, l'exécutait encore contre un code qui n'existait plus (constaté le
// 07/11/2026 : huit échecs de gamereturn.test.js après le retrait du retour d'une partie solo).
// Un module retiré pouvait aussi rester importable par erreur depuis dist\.
//
// Et l'inverse : une sortie de tsc écrite dans src\ à côté de sa source TypeScript (une compilation
// qui a mêlé deux projets, 11/11/2026 : 45 fichiers .js, .d.ts et .js.map dans app\src\, entrés dans
// un commit). Elle est retirée de même ; --verifier la signale.
//
// Seules les sorties de tsc sont visées (.js, .js.map, .d.ts, .d.ts.map) : un fichier de dist\
// est orphelin quand aucune source de même nom (.ts, .tsx, .mts, .cts, .js) n'existe dans src\.
// Les espaces de travail sont ceux de package.json, avec rootDir src et outDir dist.
// Garde-fou : scripts/sorties-orphelines.test.mjs.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OUTPUT = /\.(d\.ts\.map|d\.ts|js\.map|js)$/;
const SOURCES = ['.ts', '.tsx', '.mts', '.cts', '.js'];

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/** Les sorties compilées sans source, chemins absolus, pour chaque espace de travail de `root`. */
export function orphanOutputs(root = repo) {
  const { workspaces: dirs = [] } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const orphans = [];
  for (const dir of dirs) {
    const src = path.join(root, dir, 'src');
    const dist = path.join(root, dir, 'dist');
    if (!fs.existsSync(src)) continue;
    for (const file of walk(dist)) {
      const rel = path.relative(dist, file);
      if (!OUTPUT.test(rel)) continue;
      const base = rel.replace(OUTPUT, '');
      if (!SOURCES.some((ext) => fs.existsSync(path.join(src, base + ext)))) orphans.push(file);
    }
  }
  return orphans.sort();
}

/** Les sorties de tsc écrites dans src\ : un .js, .d.ts ou .map à côté d'une source TypeScript de même nom. */
export function leakedOutputs(root = repo) {
  const { workspaces: dirs = [] } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const leaked = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(root, dir, 'src'))) {
      if (!OUTPUT.test(file)) continue;
      const base = file.replace(OUTPUT, '');
      if (['.ts', '.tsx', '.mts', '.cts'].some((ext) => fs.existsSync(base + ext))) leaked.push(file);
    }
  }
  return leaked.sort();
}

/** Retire les sorties orphelines (dist\) et les sorties égarées dans src\ ; renvoie leur liste. */
export function removeOrphanOutputs(root = repo) {
  const orphans = [...orphanOutputs(root), ...leakedOutputs(root)];
  for (const file of orphans) fs.rmSync(file, { force: true });
  return orphans;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--verifier')) {
    const orphans = [...orphanOutputs(), ...leakedOutputs()];
    for (const file of orphans) console.log(path.relative(repo, file));
    if (orphans.length) {
      console.error(`${orphans.length} sortie(s) compilée(s) sans source ou égarée(s) dans src : node scripts/sorties-orphelines.mjs les retire.`);
      process.exit(1);
    }
  } else {
    const removed = removeOrphanOutputs();
    if (removed.length) console.log(`Sorties compilées sans source retirées : ${removed.map((f) => path.relative(repo, f)).join(', ')}`);
  }
}
