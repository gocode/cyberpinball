// Jeu d'icônes de Cyber Pinball : trait 1,75 sur une grille de 24, bouts arrondis.
// Écrit les classes .cp-i-<nom> (masques SVG) à la suite de base.css → bundle.css.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ICONS = {
  play: '<path d="M7.5 4.8v14.4L19 12z"/>',
  tables: '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  plus: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/><path d="M12 11v6M9 14h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 5.5l1 1 1.8-2M4 11.5l1 1 1.8-2"/><circle cx="5" cy="18" r="1"/>',
  update: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9.5 2.5v3.5M14.5 2.5v3.5M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9" r="1.2"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  cabinet: '<path d="M7 3h10l1 7H6z"/><path d="M6 10h12l1.5 11h-15z"/><path d="M9.5 15h5"/>',
  sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16v4"/>',
  power: '<path d="M12 3.5v8"/><path d="M6.6 7.2a7.5 7.5 0 1 0 10.8 0"/>',
  pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  gamepad: '<path d="M7 8.5h10a4.5 4.5 0 0 1 4.4 5.4l-.5 2.4a2.6 2.6 0 0 1-4.6 1.1L14.8 15H9.2l-1.5 2.4a2.6 2.6 0 0 1-4.6-1.1l-.5-2.4A4.5 4.5 0 0 1 7 8.5z"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.01"/>',
  book: '<path d="M4 5.5C6.5 4.2 9.5 4.2 12 6c2.5-1.8 5.5-1.8 8-.5v13c-2.5-1.3-5.5-1.3-8 .5-2.5-1.8-5.5-1.8-8-.5z"/><path d="M12 6v13.5"/>',
  rules: '<path d="M7 3h7.5L19 7.5V21H7z"/><path d="M14.5 3v4.5H19M10 12h6M10 16h6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3.8 21 19.5H3z"/><path d="M12 10v4.5M12 17.2v.01"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  'chevron-right': '<path d="M9 5l7 7-7 7"/>',
  'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16v4"/>',
  flipper: '<path d="M4.5 15.5 17 9.5a2.5 2.5 0 1 1 1.5 4.5L6 18.3a1.6 1.6 0 1 1-1.5-2.8z"/>',
  start: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>',
  exit: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 10a2.5 2 0 0 1 5 0c0 2.5-5 1.5-5 4a2.5 2 0 0 0 5 0"/>',
  plunger: '<path d="M12 3v11M9 14h6M10 14v4.5a2 2 0 0 0 4 0V14"/><path d="M8 3h8"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  usb: '<path d="M12 3v14"/><path d="M9.5 5.5 12 3l2.5 2.5"/><path d="M7 9v2.5l5 3 5-3V8"/><circle cx="12" cy="19" r="2"/><rect x="15.5" y="6" width="3" height="2.5"/><circle cx="7" cy="8" r="1.3"/>',
};

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const uri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s).replace(/'/g, '%27')}")`;

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const [base = fileURLToPath(new URL('./base.css', import.meta.url)), out = direct ? fileURLToPath(new URL('../components/bundle.css', import.meta.url)) : undefined] = process.argv.slice(2);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const css = Object.entries(ICONS).map(([n, b]) => `.cp-i-${n} { --i: ${uri(svg(b))} }`).join('\n');
  fs.writeFileSync(out, `${fs.readFileSync(base, 'utf8')}\n${fs.readFileSync(new URL('./fonds.css',import.meta.url),'utf8')}\n/* Icônes */\n${css}\n`);
  console.log(`${Object.keys(ICONS).length} icônes -> ${path.basename(out)}`);
}
