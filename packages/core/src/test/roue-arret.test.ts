// Arrêt de la roue (12/11/2026) : l'anneau tracé par l'étincelle, l'étincelle qui continue de
// tourner et l'éclat du médaillon disparaissaient parfois en cours de route. wheelStage réécrivait
// toute la classe de la scène à chaque état reçu et effaçait .landed, posée à l'arrêt par
// wheelMoved. Trois invariants :
// - une classe d'animation posée en différé (.landed, .moving) n'est jamais effacée par une
//   réécriture de className sur le même élément ;
// - l'anneau et l'étincelle passent derrière le médaillon choisi mais devant ses voisins ;
// - l'étincelle tourne sans fin, lentement, une fois l'anneau tracé.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { APP } from './menu-renderer';

const RENDERER = path.join(APP, 'renderer');
const read = (file: string) => fs.readFileSync(path.join(RENDERER, file), 'utf8').replace(/\r\n/g, '\n');
const css = read('frontend.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** Corps d'un bloc de frontend.css, sélecteur exact. */
function rule(selector: string): string {
  const at = `\n${css}`.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `règle « ${selector} » introuvable`);
  return css.slice(at, css.indexOf('}', at));
}

test('roue : une classe d’animation posée en différé n’est jamais effacée par une réécriture de className', () => {
  for (const file of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.js'))) {
    const src = read(file);
    const posted = new Set([...src.matchAll(/([\w.]+)\.classList\.add\('(?:landed|moving)'\)/g)].map((m) => m[1] ?? ''));
    for (const target of posted) {
      const wiped = new RegExp(`${target.replace(/\./g, '\\.')}\\.className\\s*=`).test(src);
      assert.ok(!wiped, `${file} : ${target}.className est réécrit alors que .landed ou .moving y est posé en différé`);
    }
  }
});

test('roue : anneau et étincelle derrière le médaillon choisi, devant ses voisins', () => {
  const js = read('frontend.js');
  const m = /zIndex = String\((\d+) - (\d+) \* Math\.min/.exec(js);
  assert.ok(m, 'calcul du z-index des médaillons introuvable (placeWheelItem)');
  const center = Number(m[1]);
  const neighbor = center - Number(m[2]);
  for (const selector of ['.menu-band .wheel-stage.landed .wheel-rim', '.menu-band .wheel-stage.landed .wheel-orbit']) {
    const z = Number(/z-index:\s*(\d+)/.exec(rule(selector))?.[1]);
    assert.ok(z < center && z > neighbor, `${selector} : z-index ${z}, attendu entre ${neighbor} et ${center}`);
  }
});

test('roue : l’étincelle continue de tourner lentement après le tracé', () => {
  const spark = rule('.wheel-orbit .wheel-spark');
  const orbit = /rim-orbit\s+(\d+)ms\s+linear\s+\d+ms\s+infinite/.exec(spark);
  assert.ok(orbit, 'tour sans fin de l’étincelle introuvable');
  assert.ok(Number(orbit[1]) >= 6000, `un tour en ${orbit[1]} ms : trop rapide`);
});

// Une animation qui suit une autre animation tenue (forwards, both) sur la même propriété doit
// déclarer son départ : sans « from », elle part de la valeur tenue par la précédente. Le tour sans
// fin de l'étincelle allait ainsi de 360° à 360° et restait immobile après la première révolution.
test('feuilles : une animation enchaînée après une animation tenue déclare son départ', () => {
  const frames = new Map<string, string>();
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) frames.set(m[1] ?? '', m[2] ?? '');
  const props = (body: string) => new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*?animation:\s*([^;]+);/g)) {
    const list = (m[2] ?? '').split(/,(?![^(]*\))/).map((s) => s.trim().split(/\s+/));
    list.forEach((parts, i) => {
      const name = parts.find((p) => frames.has(p));
      const body = name ? frames.get(name) ?? '' : '';
      if (!name || i === 0 || /(^|\n)\s*(from|0%)[\s,{]/.test(body)) return;
      for (const before of list.slice(0, i)) {
        const held = before.some((p) => p === 'forwards' || p === 'both');
        const prior = before.find((p) => frames.has(p));
        if (!held || !prior) continue;
        const shared = [...props(body)].filter((p) => props(frames.get(prior) ?? '').has(p));
        assert.equal(shared.length, 0, `${(m[1] ?? '').trim()} : « ${name} » suit « ${prior} » tenue sur ${shared.join(', ')} sans départ (from)`);
      }
    });
  }
});

// Mesure du bord des médaillons (12/11/2026) : des wheels ajoutées ou remplacées, de toutes
// provenances, sont mesurées au chargement (media.js, edgeCircle). Chaque forme connue pour avoir
// trompé la mesure est fixée ici, avec le cercle attendu : titre qui déborde du disque, bâton qui
// dépasse, ombre portée floue ou dure, lueur tout autour (le gabarit commun a une ombre en bas à
// droite, que la mesure prenait pour le bord), médaillon décentré dans son image, image pas carrée.
test('roue : la mesure du bord tient sur toutes les formes de wheel connues', async () => {
  const src = fs.readFileSync(path.join(RENDERER, 'media.js'), 'utf8');
  const from = src.indexOf('  const WHOLE =');
  const to = src.indexOf('  function reach(url)');
  assert.ok(from > 0 && to > from, 'mesure du bord introuvable (media.js)');
  const vm = await import('node:vm');
  const edgeCircle = vm.runInNewContext(`${src.slice(from, to)}
edgeCircle`) as (d: Uint8ClampedArray, w: number, h: number) => { r: number; dx: number; dy: number };
  const make = (w: number, h: number, alpha: (x: number, y: number) => number) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = alpha(x + 0.5, y + 0.5);
    return d;
  };
  const disc = (cx: number, cy: number, r: number) => (x: number, y: number) => Math.hypot(x - cx, y - cy) <= r;
  const title = (x: number, y: number) => y > 200 && y < 242 && x > 30 && x < 226;
  const cases: [string, number, number, number, number, number, (x: number, y: number) => number][] = [
    ['médaillon centré', 256, 256, 128, 128, 110, (x, y) => (disc(128, 128, 110)(x, y) ? 255 : 0)],
    ['médaillon décentré de 20 px', 256, 256, 148, 118, 100, (x, y) => (disc(148, 118, 100)(x, y) ? 255 : 0)],
    ['titre large qui dépasse de 4 px', 256, 256, 128, 128, 110, (x, y) => (disc(128, 128, 110)(x, y) || title(x, y) ? 255 : 0)],
    ['titre et bâton qui dépassent', 256, 256, 128, 128, 110, (x, y) => (disc(128, 128, 110)(x, y) || title(x, y) || (Math.abs(x - 128 - (128 - y)) < 6 && x > 190 && x < 225) ? 255 : 0)],
    ['ombre portée floue', 256, 256, 124, 124, 106, (x, y) => (disc(124, 124, 106)(x, y) ? 255 : Math.max(0, 230 - 25 * Math.max(0, Math.hypot(x - 132, y - 132) - 106)))],
    ['ombre dure à 70 %', 256, 256, 124, 124, 106, (x, y) => (disc(124, 124, 106)(x, y) ? 255 : disc(134, 134, 106)(x, y) ? 180 : 0)],
    ['lueur à 60 % tout autour', 256, 256, 128, 128, 100, (x, y) => (disc(128, 128, 100)(x, y) ? 255 : Math.max(0, 153 - 10 * (Math.hypot(x - 128, y - 128) - 100)))],
    ['bord lissé', 256, 256, 128, 128, 110, (x, y) => Math.round(255 * Math.min(1, Math.max(0, 110.5 - Math.hypot(x - 128, y - 128))))],
    ['image pas carrée', 256, 220, 128, 110, 108, (x, y) => (disc(128, 110, 108)(x, y) ? 255 : 0)],
    ['carré opaque, sans bord rond : la place entière', 256, 256, 128, 128, 128, () => 255],
  ];
  for (const [name, w, h, cx, cy, r, alpha] of cases) {
    const c = edgeCircle(make(w, h, alpha), w, h);
    const half = Math.max(w, h) / 2;
    const got = { r: c.r * half, x: w / 2 + c.dx * half, y: h / 2 + c.dy * half };
    assert.ok(Math.abs(got.r - r) <= 1.5 && Math.hypot(got.x - cx, got.y - cy) <= 1.5, `${name} : cercle attendu r=${r} en (${cx}, ${cy}), mesuré r=${got.r.toFixed(1)} en (${got.x.toFixed(1)}, ${got.y.toFixed(1)})`);
  }
});

// Anneau et pointeur de la table choisie (12/11/2026, photo du PinCab) : l'anneau vert, tracé en
// pointillé qui avance, gardait à midi une fente sombre, là où le début et la fin du tiret se
// touchaient bout à bout ; le halo du pointeur, dessiné au bord haut du bandeau, était coupé net
// par le cadre de son image. Trois invariants :
// - une forme fermée tracée par un pointillé animé finit en trait plein (stroke-dasharray: none) ;
// - aucun halo flou des couches de roue (roues/*.svg) ne sort du cadre de sa couche, en hauteur
//   (en largeur, les arcs continuent au-delà des bords : la coupe y est voulue) ;
// - la lumière et le dessus débordent du bandeau d'autant que le cadre de leur image.
test('roue : une forme fermée tracée en pointillé finit en trait plein, sans fente', () => {
  const frames = new Map<string, string>();
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) frames.set(m[1] ?? '', m[2] ?? '');
  let seen = 0;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (m[1] ?? '').trim();
    const body = m[2] ?? '';
    if (!/\b(circle|ellipse|rect)\b/.test(selector) || !/stroke-dasharray:\s*(?!none)/.test(body)) continue;
    const anim = /animation:\s*([^;]+);/.exec(body)?.[1];
    if (!anim) continue;
    seen++;
    const held = anim.split(/,(?![^(]*\))/).map((s) => s.trim().split(/\s+/)).filter((p) => p.includes('forwards') || p.includes('both'));
    const last = held.at(-1)?.find((p) => frames.has(p));
    assert.ok(last, `${selector} : pointillé animé sans animation tenue à la fin`);
    const end = /(?:^|\n)\s*(?:to|100%)\s*\{([^}]*)\}/.exec(frames.get(last) ?? '')?.[1] ?? '';
    assert.match(end, /stroke-dasharray:\s*none/, `${selector} : « ${last} » doit finir en trait plein (stroke-dasharray: none), sinon une fente reste à la jointure`);
  }
  assert.ok(seen > 0, 'tracé de l’anneau (.wheel-rim circle) introuvable');
});

/** Étendue verticale d'un élément SVG simple (path en commandes absolues, ellipse, circle, rect). */
function verticalExtent(tag: string, attrs: string, where: string): [number, number] {
  const num = (name: string) => Number(new RegExp(`\\s${name}="([-\\d.]+)"`).exec(attrs)?.[1] ?? Number.NaN);
  if (tag === 'ellipse' || tag === 'circle') {
    const r = tag === 'circle' ? num('r') : num('ry');
    return [num('cy') - r, num('cy') + r];
  }
  if (tag === 'rect') return [num('y'), num('y') + num('height')];
  assert.equal(tag, 'path', `${where} : élément <${tag}> à halo non pris en charge par ce test`);
  const d = /\sd="([^"]*)"/.exec(attrs)?.[1] ?? '';
  const ys: number[] = [];
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    const n = (args ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    switch (cmd) {
      case 'M':
      case 'L':
        for (let i = 1; i < n.length; i += 2) ys.push((y = n[i] ?? y));
        break;
      case 'H':
      case 'Z':
        break;
      case 'V':
        for (const v of n) ys.push((y = v));
        break;
      case 'Q':
        for (let i = 0; i + 3 < n.length; i += 4) {
          const [c, e] = [n[i + 1] ?? y, n[i + 3] ?? y];
          for (let t = 0; t <= 1; t += 1 / 64) ys.push((1 - t) ** 2 * y + 2 * (1 - t) * t * c + t * t * e);
          y = e;
        }
        break;
      default:
        assert.fail(`${where} : commande de tracé « ${cmd} » non prise en charge par ce test`);
    }
  }
  return [Math.min(...ys), Math.max(...ys)];
}

test('roue : aucun halo des couches de roue n’est coupé par le haut ou le bas de son cadre', () => {
  const dir = path.join(RENDERER, 'roues');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg') && f !== 'cadre.svg');
  assert.ok(files.length >= 12, 'couches de roue introuvables');
  for (const file of files) {
    const svg = fs.readFileSync(path.join(dir, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const [, top, height] = (/viewBox="[-\d.]+ ([-\d.]+) [-\d.]+ ([-\d.]+)"/.exec(svg) ?? []).map(Number);
    assert.ok(Number.isFinite(top) && Number.isFinite(height), `${file} : viewBox illisible`);
    const blur = new Map([...svg.matchAll(/<filter id="(\w+)"[\s\S]*?stdDeviation="([\d.]+)"/g)].map((m) => [m[1], Number(m[2])]));
    const check = (tag: string, attrs: string, filter: string) => {
      const sigma = blur.get(filter);
      assert.ok(sigma !== undefined, `${file} : filtre #${filter} introuvable`);
      const half = Number(/stroke-width="([\d.]+)"/.exec(attrs)?.[1] ?? 0) / 2;
      const [lo, hi] = verticalExtent(tag, attrs, file);
      // À 2,5 écarts types du bord de la forme, le flou ne garde que 0,6 % de son intensité : une
      // coupe plus loin ne se voit pas (l'ombre du fond de la roue Minimaliste est coupée à 2,9).
      const reach = half + 2.5 * sigma;
      assert.ok(lo - reach >= (top as number) - 0.5 && hi + reach <= (top as number) + (height as number) + 0.5,
        `${file} : le halo de <${tag}${attrs.slice(0, 60)}…> va de y=${(lo - reach).toFixed(0)} à ${(hi + reach).toFixed(0)}, hors du cadre ${top}…${(top as number) + (height as number)} : il serait coupé net`);
    };
    for (const m of svg.matchAll(/<(\w+)((?:\s[^>]*?)?)\sfilter="url\(#(\w+)\)"([^>]*)>/g)) {
      const [, tag, before, filter, after] = m;
      if (tag === 'filter') continue;
      if (tag === 'g') {
        const inner = svg.slice((m.index ?? 0) + m[0].length, svg.indexOf('</g>', m.index));
        for (const c of inner.matchAll(/<(\w+)(\s[^>]*?)\/?>/g)) check(c[1] ?? '', c[2] ?? '', filter ?? '');
      } else check(tag ?? '', `${before ?? ''} ${after ?? ''}`, filter ?? '');
    }
  }
});

test('roue : la lumière et le dessus débordent du bandeau autant que le cadre de leur image', () => {
  const block = /\.menu-band \.wheel-stage::before,\s*\.menu-band \.wheel-stage::after \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const inset = /inset:\s*calc\(-(\d+) \* var\(--w\)\) 0;/.exec(block);
  assert.ok(inset, 'débord des couches de lumière et de dessus introuvable (.wheel-stage::before, ::after)');
  const bleed = Number(inset[1]);
  for (const file of fs.readdirSync(path.join(RENDERER, 'roues')).filter((f) => /-(dessus|lumiere)\.svg$/.test(f))) {
    const head = fs.readFileSync(path.join(RENDERER, 'roues', file), 'utf8').split('\n')[0] ?? '';
    assert.ok(head.includes(`viewBox="0 ${-bleed} 1080 ${540 + 2 * bleed}"`), `${file} : cadre ${head}, attendu un débord de ${bleed} (docs/design-system/src/roues.mjs, DEBORD)`);
  }
});
