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
