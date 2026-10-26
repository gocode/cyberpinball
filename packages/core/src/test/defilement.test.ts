import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

// Listes qui défilent des écrans de gestion (.lib-actions, .lib-content, app/renderer/library.css).
// Octobre 2026, revue de Codex du menu système : le fondu (mask-image) posé au bord d'une liste
// qui défile faisait passer la dernière ligne visible pour désactivée (« Écrans et rôles »,
// « Touches par défaut des encodeurs ») ; et une liste courte, centrée en hauteur au bureau,
// commençait à une hauteur différente d'un écran à l'autre. Le garde-fou de mise en page
// (app/src/layout-check.ts) relève les mêmes défauts dans le rendu réel ; ce test les arrête
// avant tout rendu.
const RENDERER = path.join(__dirname, '..', '..', '..', '..', 'app', 'renderer');

type Rule = { file: string; selector: string; body: string };

function rules(): Rule[] {
  const out: Rule[] = [];
  for (const file of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(RENDERER, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ file, selector: selector!.trim(), body: body! });
  }
  return out;
}

/** Classes du dernier élément de chaque sélecteur de la règle (celui que la règle habille). */
function targets(selector: string): string[] {
  return selector.split(',').flatMap((s) => [...(s.trim().split(/[\s>+~]+/).pop() ?? '').matchAll(/\.([\w-]+)/g)].map((m) => m[1]!));
}

test('aucune liste qui défile ne s’efface en fondu (mask-image)', () => {
  const all = rules();
  // Classes des listes qui défilent : les deux conteneurs communs, et toute classe qui défile.
  const scrolling = new Set(['lib-actions', 'lib-content']);
  for (const r of all) if (/(?:^|;)\s*overflow(?:-y)?:\s*(?:auto|scroll)\b/m.test(r.body)) for (const c of targets(r.selector)) scrolling.add(c);
  const offenders = all
    .filter((r) => /mask-image\s*:(?!\s*none\b)/.test(r.body) && targets(r.selector).some((c) => scrolling.has(c)))
    .map((r) => `${r.file} ${r.selector.replace(/\s+/g, ' ')}`);
  assert.deepEqual(offenders, [], 'un fondu fait passer la ligne du bord pour désactivée : un filet (.more-above / .more-below, couleur de bordure) l’indique');
});

test('le bord derrière lequel il reste des entrées porte un filet', () => {
  const all = rules();
  for (const side of ['above', 'below'] as const) {
    const prop = side === 'above' ? 'border-top-color' : 'border-bottom-color';
    const rule = all.find((r) => r.file === 'library.css' && r.selector.split(',').some((s) => s.trim() === `.lib-actions.more-${side}`));
    assert.ok(rule, `.lib-actions.more-${side} absent de library.css`);
    assert.match(rule.body, new RegExp(`${prop}\\s*:\\s*var\\(--line-strong\\)`), `.lib-actions.more-${side} : ${prop} attendu`);
  }
  const base = all.find((r) => r.file === 'library.css' && r.selector.split(',').some((s) => s.trim() === '.lib-actions') && /border-block\s*:/.test(r.body));
  assert.ok(base, 'bords de .lib-actions toujours posés (transparents au repos) : rien ne bouge quand un filet s’allume');
});

test('une liste seule part juste sous l’en-tête, jamais centrée en hauteur', () => {
  const offenders = rules()
    .filter((r) => r.file === 'library.css' && /\.only-actions\b/.test(r.selector) && /align-(?:content|items|self)\s*:\s*(?:center|space-\w+|end)/.test(r.body))
    .map((r) => r.selector.replace(/\s+/g, ' '));
  assert.deepEqual(offenders, [], 'centrée en hauteur, une liste courte commence à une hauteur différente d’un écran à l’autre');
  const list = rules().find((r) => r.file === 'library.css' && r.selector.replace(/\s+/g, ' ') === '.lib-body.only-actions > .lib-actions');
  assert.ok(list && /align-self\s*:\s*start/.test(list.body), 'la liste seule doit être posée en haut de sa rangée (align-self: start)');
});
