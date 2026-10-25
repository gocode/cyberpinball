// Système d'icônes : un seul registre de dessins (app/renderer/icons.js), dont les noms sont
// exactement ceux que connaît le code (ICON_NAMES) ; des dessins faits de géométrie seule,
// pour que couleur, épaisseur et taille restent celles du CSS ; chaque page qui dessine une
// icône charge le registre avant ses scripts ; dans un même menu, deux entrées n'ont pas la
// même icône. Le garde-fou de mise en page (app/src/layout-check.ts) vérifie le reste à
// l'écran : icône inconnue, répétée dans une liste, ou plus petite que 20 px.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { ICON_NAMES } from '../icons';
import { VPX_ESSENTIALS } from '../vpx-essentials';
import { WIZARD_STEPS } from '../wizardsteps';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const RENDERER = path.join(REPO, 'app', 'renderer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CYBER_ICONS } = require(path.join(RENDERER, 'icons.js')) as { CYBER_ICONS: Record<string, string> };

const GEOMETRY: Record<string, string[]> = {
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
};

test('le registre et le code connaissent exactement les mêmes icônes', () => {
  assert.equal(new Set(ICON_NAMES).size, ICON_NAMES.length, 'nom en double dans ICON_NAMES');
  const drawn = Object.keys(CYBER_ICONS).sort();
  assert.deepEqual(drawn, [...ICON_NAMES].sort());
});

test('chaque icône est de la géométrie seule, dans le cadre de 24', () => {
  for (const [name, body] of Object.entries(CYBER_ICONS)) {
    const elements = [...body.matchAll(/<(\w+)([^>]*?)\/>/g)];
    assert.ok(elements.length > 0, `${name} : aucun élément`);
    assert.equal(body.replace(/<\w+[^>]*?\/>/g, ''), '', `${name} : seulement des éléments vides <… />`);
    for (const [, tag, attrs] of elements) {
      const allowed = GEOMETRY[tag!];
      assert.ok(allowed, `${name} : élément <${tag}> interdit`);
      for (const [, attr, value] of attrs!.matchAll(/([\w-]+)="([^"]*)"/g)) {
        assert.ok(allowed.includes(attr!), `${name} : attribut ${attr} interdit (couleur, trait et taille viennent du CSS)`);
        if (tag !== 'path' && !['r', 'rx', 'ry', 'width', 'height'].includes(attr!)) {
          for (const n of value!.split(/[\s,]+/).filter(Boolean).map(Number)) assert.ok(n >= 0.5 && n <= 23.5, `${name} : ${attr}=${value} hors du cadre`);
        }
      }
    }
    // Les chemins aussi restent dans le cadre : leurs coordonnées absolues (M, L, C… en capitales).
    for (const [, d] of body.matchAll(/ d="([^"]*)"/g)) {
      for (const [, command, args] of d!.matchAll(/([MLCSQTHV])([^A-Za-z]*)/g)) {
        const numbers = (args!.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
        if (command === 'H' || command === 'V') numbers.forEach((n) => assert.ok(n >= 0.5 && n <= 23.5, `${name} : ${command}${n} hors du cadre`));
        else numbers.forEach((n) => assert.ok(n >= 0.5 && n <= 23.5, `${name} : ${command}${args!.trim()} hors du cadre`));
      }
    }
  }
});

test('deux noms ne dessinent jamais la même icône', () => {
  const seen = new Map<string, string>();
  for (const [name, body] of Object.entries(CYBER_ICONS)) {
    const key = body.replace(/\s+/g, ' ').trim();
    assert.ok(!seen.has(key), `${name} et ${seen.get(key)} ont le même dessin`);
    seen.set(key, name);
  }
});

test('chaque page qui dessine une icône charge le registre avant ses scripts', () => {
  for (const page of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(RENDERER, page), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]!);
    const users = scripts.filter((s) => s !== 'icons.js' && fs.existsSync(path.join(RENDERER, s)) && fs.readFileSync(path.join(RENDERER, s), 'utf8').includes('cyberIcon('));
    if (!users.length) continue;
    const at = scripts.indexOf('icons.js');
    assert.ok(at >= 0, `${page} : ${users.join(', ')} dessine des icônes sans charger icons.js`);
    for (const user of users) assert.ok(scripts.indexOf(user) > at, `${page} : icons.js doit précéder ${user}`);
  }
});

test('les écrans ne copient pas de dessin : ils demandent une icône au registre', () => {
  for (const file of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.js') && f !== 'icons.js')) {
    const text = fs.readFileSync(path.join(RENDERER, file), 'utf8');
    assert.ok(!/<path d=|createElementNS\([^)]*svg/.test(text), `${file} dessine un SVG lui-même : l'ajouter au registre (icons.js)`);
  }
});

test('dans un même menu, chaque entrée a son icône à elle', () => {
  const steps = WIZARD_STEPS.map((s) => s.icon);
  // Sous-menu « Configuration de la borne » : les étapes, puis l'assistant complet, les touches par défaut et les configurations (app/src/frontend.ts).
  const cabinetMenu = [...steps, 'wizard', 'keyboard', 'layers'];
  assert.equal(new Set(cabinetMenu).size, cabinetMenu.length, `icône répétée : ${cabinetMenu.join(', ')}`);
  const groups = VPX_ESSENTIALS.map((g) => g.icon);
  assert.equal(new Set(groups).size, groups.length, `icône répétée dans les réglages essentiels : ${groups.join(', ')}`);
});

test('le design system n’emploie que des icônes du registre', () => {
  const components = path.join(REPO, 'docs', 'design-system', 'components');
  for (const name of fs.readdirSync(components)) {
    const preview = path.join(components, name, 'preview.html');
    if (!fs.existsSync(preview)) continue;
    for (const [, icon] of fs.readFileSync(preview, 'utf8').matchAll(/cp-i-([\w-]+)/g)) {
      assert.ok(Object.hasOwn(CYBER_ICONS, icon!), `${name} : icône « ${icon} » absente du registre (app/renderer/icons.js)`);
    }
  }
});
