import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { GUIDES } from '../guides';
import { guideFor, guidePath, placeGuide, type TableGuide } from '../tableguide';
import { readVpxPlayfield, type VpxPlayfield } from '../vpxinfo';
import { biff, cfb, u32 } from './fixtures';

const f32 = (...values: number[]) => {
  const b = Buffer.alloc(4 * values.length);
  values.forEach((v, i) => b.writeFloatLE(v, i * 4));
  return b;
};
const wide = (s: string) => Buffer.concat([u32(Buffer.byteLength(s, 'utf16le')), Buffer.from(s, 'utf16le')]);
/** Un élément de la table comme VPX l'écrit : son type, puis NAME et ses points (VCEN, ou VPOS de chaque point de tracé). */
const item = (type: number, name: string, pts: [number, number][], tag = 'VCEN') => Buffer.concat([u32(type), biff('NAME', wide(name)), ...pts.map((p) => biff(tag, f32(...p))), biff('ENDB')]);

test('plateau du .vpx : bords de GameData (après le script), éléments placés avec leur nom et leurs points', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-'));
  try {
    const script = Buffer.from('Sub Table1_Init : End Sub', 'latin1');
    // Les bords viennent après CODE : le script se saute par sa propre longueur.
    const gameData = Buffer.concat([biff('NAME', wide('Table1')), biff('CODE'), u32(script.length), script, biff('LEFT', f32(0)), biff('TOPX', f32(0)), biff('RGHT', f32(1000)), biff('BOTM', f32(2000)), biff('ENDB')]);
    const file = path.join(dir, 'Table.vpx');
    fs.writeFileSync(
      file,
      cfb(
        { TableName: 'Table' },
        {
          GameData: gameData,
          GameItem0: item(1, 'LeftFlipper', [[300, 1800]]),
          GameItem1: item(8, 'Scoop', [[500, 600]]),
          GameItem2: item(0, 'Wall1', [[0, 0], [100, 0], [100, 100]], 'VPOS'),
          GameItem3: item(7, 'Light1', [[10, 10]]),
        },
      ),
    );
    const pf = readVpxPlayfield(file)!;
    assert.deepEqual([pf.left, pf.top, pf.right, pf.bottom], [0, 0, 1000, 2000]);
    assert.deepEqual(pf.items, [
      { type: 'flipper', name: 'LeftFlipper', pts: [[300, 1800]] },
      { type: 'kicker', name: 'Scoop', pts: [[500, 600]] },
      { type: 'wall', name: 'Wall1', pts: [[0, 0], [100, 0], [100, 100]] },
    ]);
    assert.equal(readVpxPlayfield(path.join(dir, 'absente.vpx')), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const PF: VpxPlayfield = {
  left: 0,
  top: 0,
  right: 1000,
  bottom: 2000,
  items: [
    { type: 'flipper', name: 'LeftFlipper', pts: [[300, 1800]] },
    { type: 'flipper', name: 'RightFlipper', pts: [[700, 1800]] },
    { type: 'flipper', name: 'UpperFlipper', pts: [[200, 900]] },
    { type: 'plunger', name: 'Plunger', pts: [[950, 1900]] },
    { type: 'kicker', name: 'Scoop', pts: [[500, 600]] },
    { type: 'target', name: 'T1', pts: [[100, 500]] },
    { type: 'target', name: 'T2', pts: [[300, 500]] },
    { type: 'ramp', name: 'Ramp1', pts: [[800, 1000], [800, 400]] },
  ],
};

const GUIDE: TableGuide = {
  id: 'essai',
  vps: ['abc'],
  title: 'Essai',
  sub: 'Original · 2026',
  source: 'D’après le script.',
  shots: { 1: { name: 'Trou', el: 'Scoop' }, 2: { name: 'Cibles', el: ['T1', 'T2'] }, 3: { name: 'Rampe', el: 'ramp1' }, 4: { name: 'Orbite', at: [900, 300] } },
  pages: [{ title: 'Le but', all: true, shots: { 1: 'a', 2: 'b', 3: 'c', 4: 'd' } }],
};

test('guide placé : chaque coup au centre de ses éléments (nom sans casse), flippers principaux, lanceur', () => {
  const placed = placeGuide(GUIDE, PF)!;
  assert.deepEqual(placed.shots['1'], { name: 'Trou', x: 500, y: 600 });
  assert.deepEqual(placed.shots['2'], { name: 'Cibles', x: 200, y: 500 }, 'deux cibles : leur milieu');
  assert.deepEqual(placed.shots['3'], { name: 'Rampe', x: 800, y: 700 }, 'une rampe : le milieu de son tracé');
  assert.deepEqual(placed.shots['4'], { name: 'Orbite', x: 900, y: 300 }, 'sans élément : la position donnée');
  assert.equal(placed.found, 3);
  // Les deux flippers du bas, pas celui du haut.
  assert.deepEqual(placed.bats.map(([a]) => a), [[300, 1800], [700, 1800]]);
  assert.deepEqual(placed.from.plunger, [950, 1900]);
  // Un tir du flipper droit vers le trou : une courbe qui part du bout du flipper.
  const shot = guidePath(placed, 'r', 1)!;
  assert.match(shot.d, /^M\d+(\.\d+)? \d+(\.\d+)? Q/);
  assert.equal(guidePath(placed, 'l', 9), undefined);
  // Bords décalés : les positions restent relatives au coin du plateau.
  const moved = placeGuide(GUIDE, { ...PF, left: -50, top: -100, items: PF.items.map((i) => ({ ...i, pts: i.pts.map(([x, y]) => [x - 50, y - 100] as [number, number]) })) })!;
  assert.deepEqual(moved.shots['1'], { name: 'Trou', x: 500, y: 600 });
});

test('autre recréation du jeu (moins des trois quarts des éléments) : pas de guide', () => {
  const other: VpxPlayfield = { ...PF, items: PF.items.filter((i) => i.name !== 'Scoop' && i.name !== 'Ramp1') };
  assert.equal(placeGuide(GUIDE, other), undefined);
  // Un seul élément manquant sur quatre coups dont trois désignés : 2 sur 3, refusé ; 3 sur 4 accepté.
  const most = { ...GUIDE, shots: { ...GUIDE.shots, 5: { name: 'Spinner', el: 'Absent' } } };
  assert.equal(placeGuide(most, PF)?.found, 3);
  assert.equal(guideFor('abc', [GUIDE])?.id, 'essai');
  assert.equal(guideFor('zzz', [GUIDE]), undefined);
  assert.equal(guideFor(undefined, [GUIDE]), undefined);
});

test('chaque guide rédigé se tient : coups cités existants, tirs vers des coups, jeux VPS uniques', () => {
  const seen = new Set<string>();
  for (const g of GUIDES) {
    assert.ok(g.vps.length, `${g.id} : jeu VPS`);
    for (const id of g.vps) {
      assert.ok(!seen.has(id), `${g.id} : jeu ${id} déjà pris`);
      seen.add(id);
    }
    const shots = new Set(Object.keys(g.shots));
    for (const [n, s] of Object.entries(g.shots)) assert.ok(s.el || s.at, `${g.id} : coup ${n} sans élément ni position`);
    assert.ok(g.pages.length >= 2 && g.pages.length <= 6, `${g.id} : nombre de pages`);
    for (const p of g.pages) {
      for (const n of Object.keys(p.shots ?? {})) assert.ok(shots.has(n), `${g.id} « ${p.title} » : coup ${n} inconnu`);
      for (const [from, to] of p.paths ?? []) {
        assert.ok(['l', 'r', 'plunger'].includes(from), `${g.id} : tir depuis ${from}`);
        assert.ok(shots.has(String(to)), `${g.id} « ${p.title} » : tir vers le coup ${to} inconnu`);
      }
      const text = [p.intro, ...(p.steps ?? []), p.final, p.warn, ...[p.note ?? []].flat(), ...(p.tips ?? []).flat()].filter(Boolean).join(' ');
      for (const m of text.matchAll(/\[(\d+)\]/g)) assert.ok(shots.has(m[1]!), `${g.id} « ${p.title} » : pastille [${m[1]}] sans coup`);
      // Ni guillemet droit ni apostrophe droite dans le texte affiché.
      assert.doesNotMatch(text, /'/, `${g.id} « ${p.title} » : apostrophe droite`);
    }
  }
});
