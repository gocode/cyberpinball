// Bibliothèque d'effets des LED (led-effets.ts) : catalogue, palette, rendu de chaque effet sur une bande
// et sur une matrice (jamais noir, jamais au-dessus du plafond, mouvant, déterministe, aux couleurs de la
// palette ; ponctuels noirs après leur durée), sens de la montée, séquenceur (familles qui alternent,
// variantes récentes évitées, fondu enchaîné sans saut, effets posés qui disparaissent) et coût du rendu.
// Logique pure : aucun port, aucun écran.

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LED_FX,
  LED_FX_FAMILIES,
  LedFxSequencer,
  ledFxInfo,
  ledFxPalette,
  ledXY,
  renderLedFx,
  rgbToHsv,
  type LedFxFamily,
  type LedFxId,
  type LedFxInfo,
  type LedGrid,
} from '../index';

const STRIP: LedGrid = { width: 1, height: 60, arrangement: 'TopDownLeftRight' };
const MATRIX: LedGrid = { width: 16, height: 8, arrangement: 'LeftRightAlternateTopDown' };
const GRIDS: [string, LedGrid][] = [
  ['bande de 60', STRIP],
  ['matrice 16×8', MATRIX],
];
/** Dominante rouge franche, deux autres couleurs loin d'elle : la dominante se reconnaît à sa teinte. */
const COLORS = ['#ff0000', '#0050ff', '#00ff60'];
const LOOPS = LED_FX.filter((f) => f.kind === 'loop');

/** Instants d'essai : 20 s pour une boucle, toute la durée d'un ponctuel. */
function times(fx: LedFxInfo): number[] {
  const out: number[] = [];
  if (fx.kind === 'loop') for (let ms = 0; ms <= 20_000; ms += 125) out.push(ms);
  else for (let i = 0; i < 60; i++) out.push(Math.floor((fx.defaultMs! * i) / 60));
  return out;
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Une LED franchement allumée dans la teinte voulue. */
function showsHue(frame: Uint8Array, hue: number): boolean {
  for (let i = 0; i + 2 < frame.length; i += 3) {
    const rgb = [frame[i]!, frame[i + 1]!, frame[i + 2]!] as const;
    if (Math.max(...rgb) < 40) continue;
    const [h, s] = rgbToHsv(rgb);
    if (s >= 0.6 && hueGap(h, hue) <= 15) return true;
  }
  return false;
}

test('catalogue : au moins 10 familles et 25 variantes en boucle, des ponctuels avec leur durée, des ids uniques', () => {
  const loopFamilies = new Set(LOOPS.map((f) => f.family));
  assert.ok(loopFamilies.size >= 10, `${loopFamilies.size} familles`);
  assert.ok(LOOPS.length >= 25, `${LOOPS.length} variantes`);
  for (const fam of loopFamilies) assert.ok(LOOPS.filter((f) => f.family === fam).length >= 2, `famille ${fam} : une seule variante`);
  assert.equal(new Set(LED_FX.map((f) => f.id)).size, LED_FX.length);
  for (const fx of LED_FX) {
    assert.match(fx.id, /^[a-z]+(-[a-z]+)*$/);
    assert.equal(ledFxInfo(fx.id), fx);
    if (fx.kind === 'oneShot') assert.ok(fx.defaultMs! > 0, fx.id);
    else assert.equal(fx.defaultMs, undefined, fx.id);
    // Une famille est toute en boucle ou toute en ponctuels : le séquenceur filtre par famille.
    assert.ok(LED_FX.filter((f) => f.family === fx.family).every((f) => f.kind === fx.kind), fx.family);
  }
  for (const id of ['flash', 'ripple-center', 'rise-burst', 'curtain-open', 'pulse-double', 'spark-rain', 'strobe', 'rainbow-sweep']) {
    assert.equal(ledFxInfo(id)?.kind, 'oneShot', id);
  }
  assert.deepEqual([...LED_FX_FAMILIES].sort(), [...new Set(LED_FX.map((f) => f.family))].sort());
  assert.equal(ledFxInfo('nope'), undefined);
});

test('palette : 5 couleurs saturées, la première est la dominante, les manquantes sont des voisines', () => {
  const one = ledFxPalette(['#80c0b0']);
  assert.equal(one.length, 5);
  const [h0, s0, v0] = rgbToHsv(one[0]);
  assert.ok(hueGap(h0, rgbToHsv([0x80, 0xc0, 0xb0])[0]) < 2, 'teinte gardée');
  assert.ok(s0 >= 0.84 && v0 === 1, 'saturée, pleine valeur');
  const hues = one.map((c) => rgbToHsv(c)[0]);
  assert.ok(hueGap(hues[1]!, h0) > 25 && hueGap(hues[1]!, h0) < 45, 'voisine de teinte');
  assert.equal(new Set(one.map((c) => c.join())).size, 5, 'cinq couleurs distinctes');
  // Couleurs données gardées dans l'ordre, Rgb ou texte, illisibles et noires ignorées, cinq au plus.
  const many = ledFxPalette([[255, 0, 0], 'zzz', '#000000', '00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']);
  assert.deepEqual(many, [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
    [255, 0, 255],
  ]);
  // Un blanc reste blanc ; rien de lisible : la sarcelle de la marque.
  assert.ok(rgbToHsv(ledFxPalette(['#fff8f0'])[0])[1] < 0.12);
  assert.deepEqual(ledFxPalette([]), ledFxPalette(undefined));
  assert.ok(rgbToHsv(ledFxPalette([])[0])[1] > 0.5);
});

for (const fx of LED_FX) {
  for (const [name, grid] of GRIDS) {
    test(`${fx.id} (${name}) : allumé, sous le plafond, mouvant, déterministe, aux couleurs de la palette`, () => {
      const brightness = 0.37;
      const cap = Math.round(255 * brightness);
      const frames = times(fx).map((ms) => renderLedFx(fx.id, grid, ms, { palette: COLORS, brightness, seed: 42 }));
      assert.equal(frames[0]!.length, grid.width * grid.height * 3);
      let lit = 0;
      for (const f of frames) for (const v of f) {
        assert.ok(v <= cap, `octet ${v} au-dessus du plafond ${cap}`);
        lit += v;
      }
      assert.ok(lit > 0, 'tout noir');
      const key = (f: Uint8Array) => Buffer.from(f).toString('hex');
      assert.ok(new Set(frames.map(key)).size > 3, 'image figée');
      // Même graine, même instant : mêmes octets (et le tampon fourni est rempli tel quel).
      const out = new Uint8Array(grid.width * grid.height * 3);
      times(fx).forEach((ms, i) => {
        assert.equal(renderLedFx(fx.id, grid, ms, { palette: COLORS, brightness, seed: 42 }, out), out);
        assert.deepEqual(out, frames[i]);
      });
      if (!fx.rainbow) {
        const bright = times(fx).map((ms) => renderLedFx(fx.id, grid, ms, { palette: COLORS, brightness: 1, seed: 42 }));
        assert.ok(bright.some((f) => showsHue(f, 0)), 'la dominante (rouge) ne se voit jamais');
        // Une autre dominante change bien l'image : aucune teinte codée en dur.
        const blue = times(fx).map((ms) => renderLedFx(fx.id, grid, ms, { palette: ['#0050ff', '#ff0000'], brightness: 1, seed: 42 }));
        assert.ok(blue.some((f) => showsHue(f, rgbToHsv([0, 0x50, 0xff])[0])), 'la dominante bleue ne se voit jamais');
      }
      if (fx.kind === 'oneShot') {
        for (const ms of [fx.defaultMs!, fx.defaultMs! + 1, fx.defaultMs! * 3, -1]) {
          assert.ok(
            renderLedFx(fx.id, grid, ms, { palette: COLORS, brightness: 1, seed: 42 }).every((v) => v === 0),
            `pas noir à ${ms} ms`,
          );
        }
        // Durée réglable : à mi-chemin d'une durée doublée, encore allumé ; noir après.
        assert.ok(renderLedFx(fx.id, grid, fx.defaultMs! * 1.2, { palette: COLORS, brightness: 1, seed: 42, durationMs: fx.defaultMs! * 2 }).some((v) => v > 0));
        assert.ok(renderLedFx(fx.id, grid, fx.defaultMs! * 2, { palette: COLORS, brightness: 1, seed: 42, durationMs: fx.defaultMs! * 2 }).every((v) => v === 0));
      }
    });
  }
}

test('vitesse : une boucle à vitesse 2 montre à t ce qu’elle montrerait à 2t', () => {
  for (const id of ['comet-cross', 'aurora-soft', 'theater-chase'] as LedFxId[]) {
    assert.deepEqual(
      renderLedFx(id, STRIP, 3000, { palette: COLORS, brightness: 1, seed: 5, speed: 2 }),
      renderLedFx(id, STRIP, 6000, { palette: COLORS, brightness: 1, seed: 5 }),
    );
  }
});

test('géométrie : « monter » va vers la fin d’une bande et vers le haut d’une matrice', () => {
  const litAt = (ms: number) => {
    const f = renderLedFx('rise-burst', STRIP, ms, { palette: COLORS, brightness: 1 });
    return [...Array(60).keys()].filter((k) => f[k * 3]! + f[k * 3 + 1]! + f[k * 3 + 2]! > 0);
  };
  const early = litAt(100);
  const later = litAt(400);
  assert.ok(early.length > 0 && Math.max(...early) <= 5, `au départ, LED ${early.join(', ')}`);
  assert.ok(Math.max(...later) > Math.max(...early) + 10 && Math.max(...later) < 40, `ensuite, LED ${later.join(', ')}`);
  const ms = 400;
  const grid: LedGrid = { width: 16, height: 8, arrangement: 'TopDownLeftRight' };
  const m = renderLedFx('rise-burst', grid, ms, { palette: COLORS, brightness: 1 });
  const rows = new Set<number>();
  for (let k = 0; k < 128; k++) if (m[k * 3]! + m[k * 3 + 1]! + m[k * 3 + 2]! > 0) rows.add(ledXY(grid, k).y);
  assert.ok(rows.size > 0 && [...rows].every((y) => y >= 3), `lignes allumées : ${[...rows].join(', ')} (0 : en haut)`);
  assert.ok(rows.has(7), 'la montée part du bas');
  // Une ligne entière monte d'un bloc : toutes les LED d'une même ligne sont égales.
  for (const y of rows) {
    const row = [...Array(128).keys()].filter((k) => ledXY(grid, k).y === y).map((k) => m[k * 3]);
    assert.equal(new Set(row).size, 1, `ligne ${y} inégale`);
  }
});

test('grille vide ou dégénérée : tableau vide, aucune erreur', () => {
  assert.equal(renderLedFx('comet-single', { width: 0, height: 0, arrangement: 'LeftRightTopDown' }, 100, { brightness: 1 }).length, 0);
  assert.equal(renderLedFx('flash', { width: 1, height: 1, arrangement: 'LeftRightTopDown' }, 100, { brightness: 1 }).length, 3);
  assert.ok(renderLedFx('flash', STRIP, 100, { brightness: Number.NaN }).every((v) => v === 0));
});

function familyOf(id: LedFxId): LedFxFamily {
  return ledFxInfo(id)!.family;
}

test('séquenceur : jamais deux fois la même famille d’affilée, toutes les familles sortent, 3 dernières variantes évitées', () => {
  const seq = new LedFxSequencer({ seed: 9 }, 0);
  const ids: LedFxId[] = [seq.current];
  for (let i = 1; i <= 200; i++) ids.push(seq.next(i * 1000));
  for (let i = 1; i < ids.length; i++) {
    assert.notEqual(familyOf(ids[i]!), familyOf(ids[i - 1]!), `${ids[i - 1]} puis ${ids[i]}`);
    assert.ok(!ids.slice(Math.max(0, i - 3), i).includes(ids[i]!), `${ids[i]} répété parmi les 3 derniers`);
  }
  const loopFamilies = new Set(LOOPS.map((f) => f.family));
  assert.deepEqual(new Set(ids.map(familyOf)), loopFamilies);
  assert.ok(ids.every((id) => ledFxInfo(id)!.kind === 'loop'));
  // Même graine : même suite ; autre graine : autre suite.
  const again = new LedFxSequencer({ seed: 9 }, 0);
  assert.deepEqual([again.current, ...[...Array(200).keys()].map((i) => again.next((i + 1) * 1000))], ids);
  const other = new LedFxSequencer({ seed: 10 }, 0);
  assert.notDeepEqual([other.current, ...[...Array(200).keys()].map((i) => other.next((i + 1) * 1000))], ids);
});

test('séquenceur : familles et intensité filtrées, changement de filtre en cours de route', () => {
  const seq = new LedFxSequencer({ seed: 4, families: ['comet', 'fire', 'aurora'] }, 0);
  const seen = new Set<LedFxFamily>([familyOf(seq.current)]);
  for (let i = 1; i < 100; i++) seen.add(familyOf(seq.next(i)));
  assert.deepEqual([...seen].sort(), ['aurora', 'comet', 'fire']);
  const calm = new LedFxSequencer({ seed: 4, mood: 'calm' }, 0);
  for (let i = 1; i < 100; i++) assert.equal(ledFxInfo(calm.next(i))!.mood, 'calm');
  // Une seule famille permise : elle se répète forcément, en changeant de variante.
  const single = new LedFxSequencer({ seed: 4, families: ['twinkle'] }, 0);
  let last = single.current;
  for (let i = 1; i < 20; i++) {
    const id = single.next(i);
    assert.equal(familyOf(id), 'twinkle');
    assert.notEqual(id, last);
    last = id;
  }
  // Un filtre qui ne laisse rien (aucune famille de ce nom en boucle) retombe sur tout.
  const none = new LedFxSequencer({ seed: 4, families: ['flash'] }, 0);
  assert.equal(ledFxInfo(none.current)!.kind, 'loop');
  // Le filtre change : l'effet montré, s'il n'est plus permis, est remplacé.
  const seq2 = new LedFxSequencer({ seed: 4, families: ['comet'] }, 0);
  seq2.configure({ families: ['fire'] }, 500);
  assert.equal(familyOf(seq2.current), 'fire');
});

test('séquenceur : enchaîne seul à la durée tirée, fondu enchaîné sans saut entre deux images à 33 ms', () => {
  const seq = new LedFxSequencer({ seed: 7, colors: COLORS, families: ['gradient', 'aurora'], minMs: 4000, maxMs: 6000, fadeMs: 2000, brightness: 1 }, 0);
  let prev = seq.render(STRIP, 0);
  let last = seq.current;
  let switches = 0;
  let maxStep = 0;
  for (let ms = 33; ms < 40_000; ms += 33) {
    const frame = seq.render(STRIP, ms);
    for (let i = 0; i < frame.length; i++) maxStep = Math.max(maxStep, Math.abs(frame[i]! - prev[i]!));
    if (seq.current !== last) {
      switches++;
      last = seq.current;
    }
    prev = frame;
  }
  assert.ok(switches >= 6, `${switches} changements en 40 s`);
  assert.ok(maxStep <= 12, `saut de ${maxStep} entre deux images`);
  // Sans fondu, le passage d'un effet à l'autre saute : le test ci-dessus voit bien la différence.
  const cut = new LedFxSequencer({ seed: 7, colors: COLORS, families: ['gradient', 'aurora'], minMs: 4000, maxMs: 6000, fadeMs: 0, brightness: 1 }, 0);
  let before = cut.render(STRIP, 0);
  let cutStep = 0;
  for (let ms = 33; ms < 40_000; ms += 33) {
    const frame = cut.render(STRIP, ms);
    for (let i = 0; i < frame.length; i++) cutStep = Math.max(cutStep, Math.abs(frame[i]! - before[i]!));
    before = frame;
  }
  assert.ok(cutStep > 30, `sans fondu, saut de ${cutStep} seulement`);
});

test('séquenceur : luminosité et part de l’ambiance jamais dépassées, effets posés compris', () => {
  const seq = new LedFxSequencer({ seed: 3, colors: COLORS, brightness: 0.5, ambientLevel: 0.6 }, 0);
  const capAmbient = Math.round(255 * 0.5 * 0.6 * 0.6);
  for (let ms = 0; ms < 60_000; ms += 250) for (const v of seq.render(MATRIX, ms)) assert.ok(v <= capAmbient, `ambiance ${v} > ${capAmbient}`);
  seq.trigger('flash', 60_000);
  seq.trigger('strobe', 60_000);
  seq.trigger('comet-cross', 60_000, { durationMs: 1000 });
  let peak = 0;
  for (let ms = 60_000; ms < 61_000; ms += 20) for (const v of seq.render(MATRIX, ms)) peak = Math.max(peak, v);
  assert.ok(peak <= Math.round(255 * 0.5), `${peak} au-dessus de la luminosité réglée`);
  assert.ok(peak > capAmbient, 'les effets posés passent au-dessus de l’ambiance');
});

test('séquenceur : un effet posé se superpose puis disparaît sans rien changer à la suite', () => {
  const opts = { seed: 3, colors: COLORS, brightness: 0.8 };
  const a = new LedFxSequencer(opts, 0);
  const b = new LedFxSequencer(opts, 0);
  const sum = (f: Uint8Array) => f.reduce((s, v) => s + v, 0);
  assert.deepEqual(a.render(STRIP, 5000), b.render(STRIP, 5000));
  assert.equal(a.trigger('flash', 5000), true);
  assert.ok(sum(a.render(STRIP, 5050)) > sum(b.render(STRIP, 5050)) + 500, 'l’éclair ne se voit pas');
  // Fini (500 ms) : de nouveau la même image que sans effet.
  assert.deepEqual(a.render(STRIP, 5510), b.render(STRIP, 5510));
  // Un effet en boucle posé pour 2 s, avec ses propres couleurs, puis rien.
  assert.equal(a.trigger('comet-cross', 6000, { durationMs: 2000, colors: ['#00ff00'] }), true);
  assert.notDeepEqual(a.render(STRIP, 7000), b.render(STRIP, 7000));
  assert.deepEqual(a.render(STRIP, 8010), b.render(STRIP, 8010));
  // Id inconnu : refusé.
  assert.equal(a.trigger('nope' as LedFxId, 9000), false);
  // La suite d'effets ne bouge pas.
  assert.equal(a.next(10_000), b.next(10_000));
});

test('séquenceur : nouvelle palette en fondu, sans saut', () => {
  const seq = new LedFxSequencer({ seed: 2, colors: ['#ff0000'], families: ['gradient'], brightness: 1, paletteFadeMs: 900 }, 0);
  let prev = seq.render(STRIP, 10_000);
  seq.setPalette(['#0050ff'], 10_000);
  let maxStep = 0;
  for (let ms = 10_033; ms < 11_500; ms += 33) {
    const f = seq.render(STRIP, ms);
    for (let i = 0; i < f.length; i++) maxStep = Math.max(maxStep, Math.abs(f[i]! - prev[i]!));
    prev = f;
  }
  assert.ok(maxStep <= 25, `saut de ${maxStep}`);
  assert.ok(showsHue(seq.render(STRIP, 11_500), rgbToHsv([0, 0x50, 0xff])[0]), 'la nouvelle couleur n’est pas arrivée');
  // Sans fondu : immédiat.
  seq.setPalette(['#ff0000'], 12_000, true);
  assert.ok(showsHue(seq.render(STRIP, 12_000), 0));
});

test('coût : 1 000 LED, 300 images (fondu et effet posé compris) en moins de 300 ms', () => {
  const big: LedGrid = { width: 1, height: 1000, arrangement: 'TopDownLeftRight' };
  const out = new Uint8Array(3000);
  let worst = 0;
  for (const seed of [1, 2, 3]) {
    const seq = new LedFxSequencer({ seed, colors: COLORS }, 0);
    seq.next(5000);
    seq.trigger('spark-rain', 5000, { durationMs: 20_000 });
    for (let i = 0; i < 10; i++) seq.render(big, 5000 + i * 33, out);
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) assert.equal(seq.render(big, 5330 + i * 33, out), out);
    worst = Math.max(worst, performance.now() - t0);
  }
  assert.ok(worst < 300, `${worst.toFixed(0)} ms`);
  // Chaque effet seul, sur 1 000 LED : ordre de grandeur (quelques ms par image au plus).
  for (const fx of LED_FX) {
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) renderLedFx(fx.id, big, fx.kind === 'loop' ? i * 33 : ((fx.defaultMs! * i) / 30), { palette: COLORS, brightness: 1, seed: 1 }, out);
    const per = (performance.now() - t0) / 30;
    assert.ok(per < 5, `${fx.id} : ${per.toFixed(2)} ms par image`);
  }
});
