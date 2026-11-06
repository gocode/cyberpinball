// Bandeaux des roues du menu (Médaillons, Bandeau, Minimaliste, Arche) : chaque dessin source
// (docs/design-system/src/roues/<roue>.svg, une seule image) est coupé en trois couches pour le
// menu (app/renderer/roues), afin que la lumière du bandeau prenne la couleur de la table
// choisie (packages/core/src/tabletint.ts, frontend.css : .wheel-stage) :
//   <roue>.svg          le verre, les ombres et la lueur verte sous la table choisie (fond) ;
//   <roue>-lumiere.svg  les halos sarcelle et le néon des arcs, en blanc : un masque, peint dans
//                       la teinte de la table (sarcelle de la marque sans teinte) ;
//   <roue>-dessus.svg   le reste, posé par-dessus : cœurs clairs des néons, traits de lumière,
//                       filets, flèches et plaque du titre, au vert signal ou en blanc.
// Le halo sarcelle (#1c8f80) est un peu plus sombre que le néon (#2ad1b6) : dans le masque, son
// opacité est réduite d'autant, et une seule teinte peint les deux.
//   node docs/design-system/src/roues.mjs [--variante a]   (a : le néon reste sarcelle, seuls les halos changent)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..', '..', '..', 'app', 'renderer', 'roues');
const variant = process.argv.includes('--variante') ? process.argv[process.argv.indexOf('--variante') + 1] : 'b';
const suffix = process.argv.includes('--suffixe') ? `-${variant}` : '';
/** Halo sarcelle par rapport au néon : #1c8f80 / #2ad1b6 en luminance. */
const HALO_SCALE = 0.62;

const isHalo = (line) => /stroke="#1c8f80"/.test(line);
const isNeon = (line) => /stroke="url\(#neon\)"/.test(line);
const light = (line) => isHalo(line) || (variant === 'b' && isNeon(line));

for (const name of ['medaillons', 'bandeau', 'minimal', 'arche']) {
  const lines = fs.readFileSync(path.join(here, 'roues', `${name}.svg`), 'utf8').split(/\r?\n/);
  const open = lines.findIndex((l) => l.startsWith('<svg'));
  const defsEnd = lines.findIndex((l) => l.trim() === '</defs>');
  const close = lines.findLastIndex((l) => l.trim() === '</svg>');
  const head = lines.slice(open, defsEnd + 1);
  const body = lines.slice(defsEnd + 1, close);
  const first = body.findIndex(light);
  const note = (what) => `<!-- ${what} : couche tirée de docs/design-system/src/roues/${name}.svg par docs/design-system/src/roues.mjs (ne pas modifier ici). -->`;
  const svg = (what, rows) => [head[0], note(what), ...head.slice(1), ...rows, '</svg>', ''].join('\n');
  fs.writeFileSync(path.join(out, `${name}${suffix}.svg`), svg('Fond', body.slice(0, first)));
  fs.writeFileSync(path.join(out, `${name}-dessus${suffix}.svg`), svg('Dessus', body.slice(first).filter((l) => !light(l))));
  // Masque : en blanc, le halo atténué ; le dégradé du néon garde ses bords fondus.
  const mask = body.filter(light).map((l) =>
    isHalo(l)
      ? l.replace('stroke="#1c8f80"', 'stroke="#fff"').replace(/opacity="([\d.]+)"/, (_, o) => `opacity="${(Number(o) * HALO_SCALE).toFixed(2)}"`)
      : l.replace('url(#neon)', 'url(#neonMasque)'),
  );
  const defs = [
    '<defs>',
    ...head.filter((l) => /<filter id="(halo|haloLarge)"/.test(l)),
    '  <linearGradient id="neonMasque" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1080" y2="0">',
    '    <stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".22" stop-color="#fff"/><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/>',
    '  </linearGradient>',
    '</defs>',
  ];
  fs.writeFileSync(path.join(out, `${name}-lumiere${suffix}.svg`), [head[0], note('Lumière (masque)'), ...defs, ...mask, '</svg>', ''].join('\n'));
  console.log(`${name}${suffix} : ${first} éléments de fond, ${mask.length} de lumière, ${body.length - first - mask.length} dessus`);
}
