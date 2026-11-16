// Aucun caractère de contrôle dans les sources texte du dépôt. Une barre oblique inverse perdue en
// passant par un shell ou un script (« \b », « \a », « \v » écrits sans être échappés) devient un
// caractère invisible : trouvé le 28/10/2026 dans trois fichiers, dont une expression régulière de
// dedicated-menu.test.ts (« \brunas\b ») qui ne pouvait plus rien trouver. Tabulation, saut de ligne
// et retour chariot seuls sont admis.
//
// Second test : aucun échappement sans effet dans une chaîne du code (« '\V' » vaut « 'V' »). La même
// barre perdue, devant une lettre qui n'échappe rien, disparaît sans bruit : le 16/11/2026, la clé
// « Software\Valve\Steam » était devenue « SoftwareValveSteam », et « Installer Pinball FX » disait
// qu'il n'y avait pas Steam sur un PC qui l'avait ; le script de réveil de l'horaire de la borne ne
// trouvait aucun nom de bouton depuis le 26/10. Un texte gardé tel quel s'écrit en String.raw.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { REPO_ROOT } from './i18n-scan';

const TEXT = /\.(ts|js|cjs|mjs|json|md|ps1|nsi|nsh|css|html|cmd|txt|svg)$/i;
const SKIP = new Set(['node_modules', 'dist', 'build', 'release', 'tmp', '.git', '.claude']);
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

function* textFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* textFiles(full);
    else if (TEXT.test(entry.name)) yield full;
  }
}

test('aucun caractère de contrôle dans les sources texte', () => {
  const found: string[] = [];
  for (const top of ['app', 'packages', 'docs', 'scripts', 'interne'].filter((dir) => fs.existsSync(path.join(REPO_ROOT, dir)))) {
    for (const file of textFiles(path.join(REPO_ROOT, top))) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const m = CONTROL.exec(line);
        if (m) found.push(`${path.relative(REPO_ROOT, file)}:${i + 1} : U+${m[0].charCodeAt(0).toString(16).padStart(4, '0')}`);
      });
    }
  }
  for (const name of fs.readdirSync(REPO_ROOT).filter((n) => TEXT.test(n))) {
    if (CONTROL.test(fs.readFileSync(path.join(REPO_ROOT, name), 'utf8'))) found.push(name);
  }
  assert.deepEqual(found, []);
});

/** Ce qui peut suivre une barre oblique inverse dans une chaîne ou un gabarit sans être perdu. */
const ESCAPES = new Set(["'", '"', '\\', 'n', 'r', 't', 'b', 'f', 'v', '0', 'x', 'u', '`', '$', '\n', '\r', ' ', ' ']);
const CODE = /\.(ts|tsx|js|cjs|mjs)$/;

/** Échappements sans effet des chaînes et gabarits d'un fichier (hors gabarits balisés : String.raw…). */
function uselessEscapes(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, /\.tsx?$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const found: string[] = [];
  const kinds = new Set([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail]);
  const tagged = (node: ts.Node): boolean => {
    for (let p = node.parent, depth = 0; p && depth < 3; p = p.parent, depth++) if (ts.isTaggedTemplateExpression(p)) return true;
    return false;
  };
  const visit = (node: ts.Node): void => {
    if (kinds.has(node.kind) && !tagged(node)) {
      const raw = node.getText(sf);
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] !== '\\') continue;
        const next = raw[i + 1] ?? '';
        if (!ESCAPES.has(next)) found.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf) + i).line + 1} : « \\${next} »`);
        i++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

test('détecteur d’échappements sans effet : barre perdue signalée, String.raw et regex admis', () => {
  const B = '\\';
  assert.deepEqual(uselessEscapes('a.ts', `const k = 'Software${B}Valve';`), ['a.ts:1 : « \\V »']);
  assert.deepEqual(uselessEscapes('a.ts', `const s = \`_${B}d+$\`;`), ['a.ts:1 : « \\d »']);
  assert.deepEqual(uselessEscapes('a.ts', `const k = 'Software${B}${B}Valve'; const r = /${B}d+/; const s = String.raw\`${B}d \${x} ${B}w\`;`), []);
});

test('aucun échappement sans effet dans les chaînes du code', () => {
  const found: string[] = [];
  for (const top of ['app', 'packages', 'scripts', 'interne'].filter((dir) => fs.existsSync(path.join(REPO_ROOT, dir)))) {
    for (const file of textFiles(path.join(REPO_ROOT, top))) {
      if (!CODE.test(file) || file.endsWith('.d.ts')) continue;
      found.push(...uselessEscapes(path.relative(REPO_ROOT, file), fs.readFileSync(file, 'utf8')));
    }
  }
  assert.deepEqual(found, []);
});
