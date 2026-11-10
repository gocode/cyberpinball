// Entrée dans le Juke-box (jukebox-entrance.ts) : la feuille de style tient les mêmes temps que le
// cœur (durée, pourcentages des images clés), et le DMD passe de « JUKE-BOX » au visualiseur par une
// tache de lumière, sans jamais mêler les deux images.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DMD_HEIGHT, DMD_WIDTH, blankDots } from '../livedmd';
import { JUKEBOX_ENTRANCE, jukeboxEntranceFrame } from '../jukebox-entrance';

const css = fs.readFileSync(path.join(__dirname, '../../../../app/renderer/jukebox.css'), 'utf8');

test('la feuille de style dure ce que dit le cœur, et ses images clés tombent sur ses temps', () => {
  assert.match(css, new RegExp(`--jb-entree-ms: ${JUKEBOX_ENTRANCE.end}ms`));
  const pct = (ms: number) => `${Math.round((ms / JUKEBOX_ENTRANCE.end) * 1000) / 10}%`;
  const section = css.slice(css.indexOf('Entrée depuis la roue'));
  for (const ms of [JUKEBOX_ENTRANCE.arm, JUKEBOX_ENTRANCE.launch, JUKEBOX_ENTRANCE.dmdPass, JUKEBOX_ENTRANCE.listIn, JUKEBOX_ENTRANCE.departed, JUKEBOX_ENTRANCE.impact, JUKEBOX_ENTRANCE.listReady, JUKEBOX_ENTRANCE.settled])
    assert.ok(section.includes(pct(ms)), `image clé à ${ms} ms (${pct(ms)}) absente de jukebox.css`);
  // Chaque animation de l'entrée part du temps commun (délai négatif posé par jukebox.js).
  for (const m of section.matchAll(/animation: jb-entree-[a-z-]+ ([^;]+);/g)) assert.match(m[1]!, /var\(--jb-entree-ms\) linear var\(--jb-entree-t, 0ms\) both/);
});

test('DMD : avant le passage « JUKE-BOX », après lui le visualiseur ; pendant, chaque colonne est l’une ou l’autre', () => {
  const from = { dots: blankDots().fill(4) };
  const to = { dots: blankDots().fill(9), rgb: new Uint8Array(DMD_WIDTH * DMD_HEIGHT * 3).fill(200) };
  const green = [139, 226, 58] as const;
  assert.equal(jukeboxEntranceFrame(from, to, 0, green), from);
  assert.equal(jukeboxEntranceFrame(from, to, JUKEBOX_ENTRANCE.dmdPassEnd, green), to);
  const mid = jukeboxEntranceFrame(from, to, (JUKEBOX_ENTRANCE.dmdPass + JUKEBOX_ENTRANCE.dmdPassEnd) / 2, green);
  // À gauche le visualiseur, à droite « JUKE-BOX », en couleur réglée ; au milieu la tache, plus claire.
  assert.equal(mid.dots[16 * DMD_WIDTH + 2], 9);
  assert.equal(mid.dots[16 * DMD_WIDTH + 125], 4);
  assert.deepEqual([...mid.rgb!.slice((16 * DMD_WIDTH + 125) * 3, (16 * DMD_WIDTH + 125) * 3 + 3)], [...green]);
  const lit = Array.from({ length: DMD_WIDTH }, (_, x) => (16 * DMD_WIDTH + x) * 3).filter((i) => mid.rgb![i] === 150 && mid.rgb![i + 1] === 236);
  assert.ok(lit.length >= 3, 'la tache (sarcelle claire) brille au milieu de l’afficheur');
});
