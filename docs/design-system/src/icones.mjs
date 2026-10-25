// Jeu d'icônes de Cyber Pinball (registre app/renderer/icons.js) : trait 2 sur une grille de 24,
// bouts arrondis. Écrit les classes .cp-i-<nom> (masques SVG) à la suite de base.css → bundle.css.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Les dessins viennent du registre de l'application, le seul endroit où ils existent ;
// ses commentaires « // Famille » rangent la planche.
const REGISTRY = fileURLToPath(new URL('../../../app/renderer/icons.js', import.meta.url));
export const ICONS = createRequire(import.meta.url)(REGISTRY).CYBER_ICONS;
/** Familles du registre, dans son ordre : [titre, noms]. */
export const FAMILIES = [];
for (const line of fs.readFileSync(REGISTRY, 'utf8').split(/\r?\n/)) {
  const family = /^  \/\/ (.+)$/.exec(line);
  if (family) FAMILIES.push([family[1], []]);
  const key = /^  '?([\w-]+)'?: '/.exec(line);
  if (key && FAMILIES.length) FAMILIES.at(-1)[1].push(key[1]);
}

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const uri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s).replace(/'/g, '%27')}")`;

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const [base = fileURLToPath(new URL('./base.css', import.meta.url)), out = direct ? fileURLToPath(new URL('../components/bundle.css', import.meta.url)) : undefined] = process.argv.slice(2);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const css = Object.entries(ICONS).map(([n, b]) => `.cp-i-${n} { --i: ${uri(svg(b))} }`).join('\n');
  fs.writeFileSync(out, `${fs.readFileSync(base, 'utf8')}\n${fs.readFileSync(new URL('./fonds.css',import.meta.url),'utf8')}\n/* Icônes */\n${css}\n`);
  console.log(`${Object.keys(ICONS).length} icônes -> ${path.basename(out)}`);
}
