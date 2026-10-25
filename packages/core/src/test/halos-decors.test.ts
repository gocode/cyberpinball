// Halos des décors dessinés (app/renderer/**/*.svg) : un filtre de flou dont la zone est en
// pourcentage de la forme (x="-10%" width="120%", la valeur par défaut de SVG) coupe net
// la lueur d'une forme étroite. Sur la borne, le 25 octobre 2026, les flèches de la roue
// Médaillons (20 px de large, 2 px de marge pour un flou de 5) avaient un halo tranché en
// rectangle. Chaque filtre de flou couvre donc tout le dessin, en unités du dessin.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const RENDERER = path.join(__dirname, '..', '..', '..', '..', 'app', 'renderer');

function svgFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) return svgFiles(file);
    return e.name.endsWith('.svg') ? [file] : [];
  });
}

test('décors : chaque filtre de flou couvre tout le dessin, sa lueur n’est jamais tranchée', () => {
  const problems: string[] = [];
  const files = svgFiles(RENDERER);
  assert.ok(files.some((f) => f.endsWith('medaillons.svg')), 'décors de la roue introuvables');
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const box = /viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*"/.exec(text);
    for (const m of text.matchAll(/<filter\b([^>]*)>([\s\S]*?)<\/filter>/g)) {
      if (!/feGaussianBlur|feDropShadow/.test(m[2]!)) continue;
      const attrs = m[1]!;
      const id = /id="([^"]+)"/.exec(attrs)?.[1] ?? '?';
      const where = `${path.relative(RENDERER, file)} #${id}`;
      if (!/filterUnits="userSpaceOnUse"/.test(attrs)) {
        problems.push(`${where} : zone du flou en pourcentage de la forme (filterUnits="userSpaceOnUse" attendu)`);
        continue;
      }
      if (!box) continue;
      const num = (name: string) => Number(new RegExp(`\\b${name}="([-\\d.]+)"`).exec(attrs)?.[1]);
      const [bx, by, bw, bh] = box.slice(1).map(Number) as [number, number, number, number];
      const [x, y, w, h] = [num('x'), num('y'), num('width'), num('height')];
      if (!(x <= bx && y <= by && x + w >= bx + bw && y + h >= by + bh)) problems.push(`${where} : la zone du flou (${x}, ${y}, ${w} × ${h}) ne couvre pas le dessin (${bx}, ${by}, ${bw} × ${bh})`);
    }
  }
  assert.deepEqual(problems, []);
});
