// Garde de l'assemblage du front-end pour les tests (frontend-source.ts) : chaque bloc sorti de
// frontend.ts y est bien créé et lu par sa façade, et ses `ctx.` ne visent que l'état vivant
// déclaré ; sans quoi les tests qui relisent le code par motif liraient autre chose que lui.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { FRONTEND_PARTS, frontendSource, LIBRARY_PARTS, librarySource } from './frontend-source';
import { REPO_ROOT } from './i18n-scan';

const src = (file: string) => fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', file), 'utf8');

test('découpage du front-end : chaque bloc sorti de frontend.ts y est créé, et ses marques sont connues', () => {
  for (const [container, part] of [...FRONTEND_PARTS.map((p) => ['frontend.ts', p] as const), ...LIBRARY_PARTS.map((p) => ['library.ts', p] as const)]) {
    assert.match(src(container), new RegExp(`const ${part.facade} = ${part.factory}\\(\\{`), `${part.file} : créé dans ${container} sous le nom ${part.facade}`);
    // Les seuls ctx.<nom> lus comme une valeur : son état vivant déclaré (un ctx.<nom>() est une fonction
    // prêtée telle quelle ; le reste est déstructuré en tête de la fabrique).
    const used = new Set([...src(part.file).matchAll(/\bctx\.(\w+)\b(?!\s*\()/g)].map((m) => m[1]!));
    assert.deepEqual([...used].filter((n) => !part.live.includes(n)), [], `${part.file} : ctx.<nom> hors de live`);
  }
  // L'assemblage garde tout frontend.ts, sans les préfixes des façades.
  const assembled = frontendSource();
  assert.match(assembled, /export function startFrontend\(\): void \{/);
  for (const part of FRONTEND_PARTS) assert.ok(!assembled.includes(`${part.facade}.`), `${part.facade}. retiré`);
  const library = librarySource();
  assert.match(library, /export function createLibrary\(host: LibraryHost\) \{/);
  for (const part of LIBRARY_PARTS) assert.ok(!library.includes(`${part.facade}.`), `${part.facade}. retiré`);
});
