import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

// Le garde-fou de mise en page (app/src/layout-check.ts) injecte ses scripts dans chaque
// page ; une erreur de syntaxe y est avalée (page qui ne répond pas) et le relevé dit
// « aucun problème ». Octobre 2026 : une variable déclarée deux fois a rendu le garde-fou
// aveugle sans qu'aucun essai échoue. Chaque script doit donc au moins se compiler.
const SOURCE = path.join(__dirname, '..', '..', '..', '..', 'app', 'src', 'layout-check.ts');

test('les scripts injectés par le garde-fou de mise en page se compilent', () => {
  const source = fs.readFileSync(SOURCE, 'utf8');
  // Un commentaire peut précéder le gabarit (marque i18n-ignore du relevé des textes).
  const scripts = [...source.matchAll(/const (\w+) = (?:\/\*[^*]*\*\/ )?String\.raw`([\s\S]*?)`;/g)];
  assert.deepEqual(
    scripts.map((m) => m[1]),
    ['SCRIPT', 'STABLE', 'SETTLED'],
  );
  for (const [, name, body] of scripts) {
    assert.doesNotThrow(() => new Function(`return ${body}`), `${name} ne se compile pas`);
  }
});

// Les pilotes automatiques à plusieurs fenêtres (assistant, écran des tables) les inspectent en même
// temps : l'une après l'autre, l'assistant passait environ 5 s par touche rejouée, l'essentiel de ses
// tests (23/11/2026). Chaque fenêtre garde son relevé ; les problèmes restent notés dans l'ordre.
test('pilotes à plusieurs fenêtres : inspection des fenêtres en même temps (checkAll), jamais une à une', () => {
  const app = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
  const source = fs.readFileSync(SOURCE, 'utf8');
  assert.match(source, /async checkAll\(pages: \{ contents: WebContents; where: string \}\[\]\): Promise<void> \{\s*const found = await Promise\.all\(/);
  for (const file of ['wizard.ts', 'library.ts']) {
    const text = fs.readFileSync(path.join(app, file), 'utf8');
    assert.match(text, /layout\.checkAll\(/, `${file} : checkAll`);
    assert.doesNotMatch(text, /for \([^)]*\) \{?\s*(if \([^)]*\) )?await layout\.check\(/, `${file} : une fenêtre après l'autre`);
  }
});
