// Copie de la police à points du DMD pour les fenêtres : écrit app/renderer/police-points.js
// d'après packages/core/src/dmdfont.ts (DMD_FONT_ROWS, compilé). Les afficheurs de repli
// (app/renderer/fallback.js) écrivent ainsi avec les mêmes signes que le DMD vivant du menu.
// À relancer après tout changement de la police, depuis la racine du dépôt :
//   npm run build && node scripts/police-points.mjs
// packages/core/src/test/police-points.test.ts refuse une copie en retard.
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { DMD_FONT_ROWS } = require(path.join(root, 'packages', 'core', 'dist', 'dmdfont.js'));

const lines = [
  '// Police à points du DMD, « Saira Points » : copie de DMD_FONT_ROWS (packages/core/src/dmdfont.ts),',
  '// écrite par scripts/police-points.mjs. Ne pas modifier à la main : changer dmdfont.ts, puis',
  '// relancer le script (packages/core/src/test/police-points.test.ts refuse une copie en retard).',
  '// Chaque signe : ses lignes, « # » pour un point allumé.',
  '',
  'const CYBER_POINTS = {',
];
for (const [name, font] of Object.entries(DMD_FONT_ROWS)) {
  lines.push(`  ${name}: {`, `    height: ${font.height},`, `    spacing: ${font.spacing},`, '    glyphs: {');
  for (const [c, rows] of Object.entries(font.glyphs)) lines.push(`      ${JSON.stringify(c)}: ${JSON.stringify(rows)},`);
  lines.push('    },', '  },');
}
lines.push('};', '', "if (typeof module === 'object' && module.exports) module.exports = { CYBER_POINTS };", '');
const out = path.join(root, 'app', 'renderer', 'police-points.js');
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`${path.relative(root, out)} : ${Object.entries(DMD_FONT_ROWS).map(([n, f]) => `${n} ${Object.keys(f.glyphs).length} signes`).join(', ')}`);
