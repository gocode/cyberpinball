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

// Mesure du bord d'un médaillon dont le titre déborde du disque (logo de table réel, 12/11/2026) :
// l'anneau doit rester sur le cercle, pas être tiré vers le titre.
test('roue : la mesure du bord ignore un titre qui déborde du médaillon', async () => {
  const src = fs.readFileSync(path.join(RENDERER, 'media.js'), 'utf8');
  const from = src.indexOf('  const WHOLE =');
  const to = src.indexOf('  function reach(url)');
  assert.ok(from > 0 && to > from, 'mesure du bord introuvable (media.js)');
  const vm = await import('node:vm');
  const edgeCircle = vm.runInNewContext(`${src.slice(from, to)}\nedgeCircle`) as (d: Uint8ClampedArray, w: number, h: number) => { r: number; dx: number; dy: number };
  const size = 256;
  const data = new Uint8ClampedArray(size * size * 4);
  const R = 100;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const inDisc = Math.hypot(x + 0.5 - 128, y + 0.5 - 128) <= R;
    // Titre en travers du bas : plus large que le disque, il dépasse sous lui.
    const inTitle = y >= 190 && y < 246 && x >= 6 && x < 250;
    if (inDisc || inTitle) data[(y * size + x) * 4 + 3] = 255;
  }
  const c = edgeCircle(data, size, size);
  const half = size / 2;
  assert.ok(Math.abs(c.r * half - R) < 2, `rayon ${(c.r * half).toFixed(1)} au lieu de ${R}`);
  assert.ok(Math.hypot(c.dx, c.dy) * half < 2, `centre décalé de ${(c.dx * half).toFixed(1)}, ${(c.dy * half).toFixed(1)}`);
});
