import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

// Cadre de sélection des pages de l'application : un outline est tracé autour de l'élément,
// hors de sa boîte ; dans une liste qui défile, il est rogné à gauche, et en haut ou en bas
// quand l'élément touche le bord (« Mode d'affichage », « Retour », « VPX Version »…).
const RENDERER = path.join(__dirname, '..', '..', '..', '..', 'app', 'renderer');

test('chaque contour des pages est tracé à l’intérieur de son élément (outline-offset négatif)', () => {
  const offenders: string[] = [];
  for (const file of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(RENDERER, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const width = /(?:^|;)\s*outline:\s*([\d.]+[a-z%]+)\s/m.exec(body!)?.[1];
      if (!width) continue;
      const offset = /outline-offset:\s*(-[\d.]+[a-z%]+)\s*;/.exec(body!)?.[1];
      if (offset !== `-${width}`) offenders.push(`${file} ${selector!.trim()} : outline ${width}, outline-offset ${offset ?? 'absent'}`);
    }
  }
  assert.deepEqual(offenders, [], 'ajouter outline-offset: -<épaisseur> à côté de l’outline');
});
