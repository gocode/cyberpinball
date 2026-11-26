// Garde de la lecture bornée (boundedread.ts), sur toutes les sources : aucun fichier binaire lu d'un
// bloc sans dire pourquoi sa taille est bornée. Défaut d'origine : lecture-bornee.test.ts.
//
// Fichier à part, sans processus lancé : il reste un test rapide, passé par les contrôles express de
// chaque branche. Rangé avec les essais de fichiers creux (fsutil, donc test lent), il ne tournait que
// dans la suite complète du train : une lecture d'icône non bornée (26/11/2026) a ainsi passé la
// vérification de sa branche et mis proto/ecrans au rouge.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const REPO = path.join(__dirname, '..', '..', '..', '..');

/** Lecture d'un fichier entier (écrit en morceaux pour que ce fichier ne s'accuse pas). */
const WHOLE_READ = new RegExp(['\\bread', 'FileSync\\s*\\(|\\b(?:fs|fsp|promises)\\.read', 'File\\s*\\('].join(''), 'g');
const MARKER = 'lecture entière :';

/**
 * Arguments de premier niveau de l'appel dont la parenthèse ouvrante est à `open` (l'appel peut
 * continuer sur les lignes suivantes) : « readFileSync(join(a, 'b'), 'utf8') » en donne deux.
 */
function callArguments(text: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      current += c;
      if (c === '\\') current += text[++i] ?? '';
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth === 0) break;
      depth--;
    } else if (c === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function sources(dir: string, found: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', 'release', '.git', 'test'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sources(full, found);
    else if (/\.(ts|mts|cts)$/.test(e.name)) found.push(full);
  }
  return found;
}

test('aucun fichier binaire lu d’un bloc sans dire pourquoi sa taille est bornée', () => {
  const offenders: string[] = [];
  for (const dir of ['packages/core/src', 'packages/installer/src', 'packages/win-displays/src', 'app/src'].filter((d) => fs.existsSync(path.join(REPO, d)))) {
    for (const file of sources(path.join(REPO, dir))) {
      const text = fs.readFileSync(file, 'utf8');
      const lines = text.split('\n');
      for (const m of text.matchAll(WHOLE_READ)) {
        // Un second argument (encodage, options) : un texte (script, réglages), pas un fichier binaire.
        // Un rappel seul (fs.readFile(f, (error, body) => …)) laisse la lecture binaire.
        const args = callArguments(text, m.index + m[0].length - 1);
        if (args.length >= 2 && !/^(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>|^function\b/.test(args[1]!)) continue;
        const i = text.slice(0, m.index).split('\n').length - 1;
        if (lines[i]!.includes(MARKER) || lines[i - 1]?.includes(MARKER)) continue;
        offenders.push(`${path.relative(REPO, file)}:${i + 1} ${lines[i]!.trim()}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'un fichier posé par l’utilisateur se lit par morceaux (fileDigest, readRange) ou par readWholeFile avec une limite (boundedread.ts) ; un fichier toujours petit le dit en commentaire « // lecture entière : <raison> »',
  );
});
