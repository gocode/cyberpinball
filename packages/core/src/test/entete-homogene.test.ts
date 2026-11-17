// En-tête homogène (17/11/2026) : « la roue dentée, carrée au survol, jure à côté des pastilles
// rondes ; sur les autres écrans, on n'a plus les informations d'en-tête, et la roue est décalée
// par rapport aux pastilles ». La règle : la roue dentée est une pastille ronde du même gabarit que
// ses voisines (hauteur, haut, fond, filet, survol), à l'écart habituel d'elles, sur l'écran des
// tables comme sur la ligne de la marque d'un écran plein ; la carte du joueur et ses badges sont
// sur les deux.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
const css = read('app', 'renderer', 'frontend.css') + read('app', 'renderer', 'niveau.css');

/** Le bloc d'une règle, au sélecteur exact en début de ligne. */
function rule(selector: string): string {
  const at = css.search(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`));
  assert.ok(at >= 0, `règle ${selector}`);
  return css.slice(at, css.indexOf('}', at));
}
const prop = (block: string, name: string) => new RegExp(`\\n\\s*${name}: ([^;]+);`).exec(block)?.[1]?.trim();
const cq = (block: string, name: string) => Number(/^([\d.]+)cqmin$/.exec(prop(block, name) ?? '')?.[1]);
const near = (a: number, b: number, why: string) => assert.ok(Math.abs(a - b) < 0.06, `${why} : ${a} contre ${b}`);

test('en-tête : la roue dentée est une pastille ronde du gabarit de ses voisines, au menu des tables', () => {
  const gear = rule('.gear');
  const corner = rule('.status-corner');
  assert.equal(prop(gear, 'border-radius'), '50%', 'un rond, jamais un carré');
  for (const pill of ['.friends-pill', '.badges-pill', '.player-card', '.downloads-pill']) {
    const p = rule(pill);
    near(cq(gear, 'width'), cq(p, 'min-height'), `largeur de la roue et hauteur de ${pill}`);
    near(cq(gear, 'height'), cq(p, 'min-height'), `hauteur de la roue et de ${pill}`);
    assert.equal(prop(gear, 'background'), prop(p, 'background'), `fond de ${pill}`);
    assert.equal(prop(gear, 'border'), prop(p, 'border'), `filet de ${pill}`);
  }
  near(cq(gear, 'top'), cq(corner, 'top'), 'même haut que les pastilles');
  // À l'écart habituel des pastilles : leur coin s'arrête à sa gauche.
  near(cq(corner, 'right') - cq(gear, 'right') - cq(gear, 'width'), cq(corner, 'gap'), 'écart entre la roue et les pastilles');
  // Le survol : celui des pastilles (filet et anneau verts), pas un fond carré.
  const hover = rule('body.mouse .gear:hover');
  assert.equal(prop(hover, 'box-shadow'), prop(rule('body.mouse .friends-pill:hover'), 'box-shadow'));
  assert.equal(prop(hover, 'border-color'), 'var(--signal)');
  assert.equal(prop(hover, 'background'), undefined, 'le fond ne change pas au survol');
});

test('en-tête : sur un écran plein, la roue suit les pastilles de la ligne de la marque, au même centre', () => {
  const gear = rule('.gear');
  const head = rule('.gear.on-head');
  const corner = rule('.status-corner');
  const onHead = rule('.status-corner.on-head');
  // La ligne pose la hauteur de ses pastilles ; chacune la lit, dans sa feuille (frontend.css ou niveau.css).
  const line = cq(onHead, '--pill-height');
  assert.ok(line > 0, '--pill-height posée par la ligne de la marque');
  const sized = css.slice(css.indexOf('.status-corner.on-head .notice-toast,'));
  const block = sized.slice(0, sized.indexOf('}'));
  for (const pill of ['.notice-toast', '.friends-pill', '.downloads-pill']) assert.ok(block.includes(`.status-corner.on-head ${pill}`), `${pill} sur la ligne`);
  assert.equal(prop(block, 'min-height'), 'var(--pill-height)');
  const level = read('app', 'renderer', 'niveau.css');
  assert.match(level, /\n\.player-card,\n\.badges-pill \{\n\s*height: var\(--pill-height, auto\);\n\s*min-height: var\(--pill-height, 5\.93cqmin\);/, 'carte et badges à la hauteur de la ligne');
  near(cq(head, 'width'), line, 'largeur de la roue');
  near(cq(head, 'height'), line, 'hauteur de la roue');
  near(cq(head, 'top'), cq(onHead, 'top'), 'même haut que les pastilles de la ligne');
  // Même centre qu'au menu des tables : la roue ne saute pas d'un écran à l'autre.
  near(cq(head, 'right') + cq(head, 'width') / 2, cq(gear, 'right') + cq(gear, 'width') / 2, 'centre horizontal');
  near(cq(head, 'top') + cq(head, 'height') / 2, cq(onHead, 'top') + line / 2, 'centre vertical');
  assert.ok(cq(head, 'right') + cq(head, 'width') < cq(corner, 'right'), 'à droite des pastilles');
  // Le rendu la met sur la ligne quand le processus principal le dit.
  assert.match(read('app', 'renderer', 'frontend.js'), /el\('button', `gear\$\{s\.zone === 'head' \? ' on-head' : ''\}`\)/);
});

test('en-tête : la carte du joueur et ses badges, sur l’écran des tables comme sur les écrans pleins', () => {
  const main = read('app', 'src', 'frontend.ts');
  const corner = main.slice(main.indexOf('function menuCorner('), main.indexOf('function cinemaFor('));
  assert.doesNotMatch(corner, /zone\.place === 'corner' && zoneScreen\(\) === 'menu' \? playerCard\(\)/, 'plus réservée à l’écran des tables');
  assert.match(corner, /const player = screen !== 'attract' && screen !== 'jukebox' \? playerCard\(\) : undefined;/);
});
