// Animations des LED hors partie : réglages (lecture sûre, écriture), palette de la table, moteur
// (luminosité maximale jamais dépassée, transitions, aucun hasard) et contrôleur de l'application
// (rien ne tourne sans LED, l'ambiance se tait dès qu'une partie se prépare, l'essai des bandes garde la main).
//
// Le contrôleur et le pilote sont chargés depuis app/dist (compilé avant les tests) avec un pilote
// simulé : aucun port, aucun réseau, rien à l'écran.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_LED_ANIMATIONS,
  INTRO_TIMELINE,
  LED_AMBIENT_CEILING,
  LED_AMBIENT_STYLES,
  LED_SHUFFLE_MIN_MS,
  LED_BRIGHTNESS_CHOICES,
  LED_FIXED_COLORS,
  LED_SPEEDS,
  LedAmbientEngine,
  ledAnimationsFile,
  ledFixedColorId,
  ledFxInfo,
  ledPalette,
  ledPaletteFrom,
  ledStyleDetail,
  ledStyleLabel,
  normalizeLedAnimations,
  readLedAnimations,
  renderLedIntro,
  rgbToHsv,
  writeLedAnimations,
  type CabinetLeds,
  type LedAnimationSettings,
  type LedGrid,
  type LedStripSpec,
  type Rgb,
} from '../index';

const strip = (over: Partial<LedStripSpec> = {}): LedStripSpec => ({
  name: 'Bande',
  output: 1,
  width: 1,
  height: 20,
  arrangement: 'TopDownLeftRight',
  colorOrder: 'GRB',
  brightness: 100,
  dofOutput: 1,
  ...over,
});
const teensy = (strips: LedStripSpec[]): CabinetLeds => ({ controller: 'TeensyStripController', port: 'COM7', strips });
const withDir = (run: (dir: string) => void | Promise<void>) => async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ledanim-'));
  try {
    await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
const settings = (over: Partial<LedAnimationSettings> = {}): LedAnimationSettings => normalizeLedAnimations({ ...DEFAULT_LED_ANIMATIONS, ...over });
/** Moteur à graine fixe : le Florilège rejoue la même suite d'effets d'un essai à l'autre. */
const engineOf = (over: Partial<LedAnimationSettings> = {}, seed = 7) => new LedAmbientEngine(settings(over), { seed });
const grid: LedGrid = { width: 1, height: 20, arrangement: 'TopDownLeftRight' };
const hueOf = (c: Rgb) => rgbToHsv(c)[0];
const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const hexHue = (hex: string) => hueOf([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
/** Somme des canaux rouge, vert et bleu d'une image. */
const channels = (rgb: Uint8Array): [number, number, number] => {
  const s: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < rgb.length; i++) s[i % 3]! += rgb[i]!;
  return s;
};
const peak = (rgb: Uint8Array) => rgb.reduce((m, v) => Math.max(m, v), 0);
const sum = (rgb: Uint8Array) => rgb.reduce((a, v) => a + v, 0);

// --- Réglages ---------------------------------------------------------------------------------

test('Animations LED : des valeurs sûres par défaut, et tout réglage illisible les retrouve', () => {
  assert.equal(DEFAULT_LED_ANIMATIONS.enabled, true);
  assert.ok(DEFAULT_LED_ANIMATIONS.brightness <= 40, 'luminosité modérée par défaut');
  assert.deepEqual(normalizeLedAnimations(undefined), DEFAULT_LED_ANIMATIONS);
  assert.deepEqual(normalizeLedAnimations('n’importe quoi'), DEFAULT_LED_ANIMATIONS);
  assert.deepEqual(normalizeLedAnimations({ style: 'disco', speed: 3, color: 'rouge', brightness: 'fort', enabled: 'oui', idleMinutes: NaN }), DEFAULT_LED_ANIMATIONS);
  assert.equal(normalizeLedAnimations({ brightness: 5000 }).brightness, 100);
  assert.equal(normalizeLedAnimations({ brightness: -4 }).brightness, 5);
  assert.equal(normalizeLedAnimations({ idleMinutes: -9 }).idleMinutes, 0);
  assert.equal(normalizeLedAnimations({ color: ' #FF7A1A ' }).color, '#ff7a1a');
  for (const style of LED_AMBIENT_STYLES) assert.equal(normalizeLedAnimations({ style }).style, style);
});

test('Animations LED : le Florilège est le premier style, celui par défaut, et un style enregistré reste respecté', () => {
  assert.equal(LED_AMBIENT_STYLES[0], 'medley');
  assert.equal(DEFAULT_LED_ANIMATIONS.style, 'medley');
  assert.equal(normalizeLedAnimations({ style: 'medley' }).style, 'medley');
  assert.equal(normalizeLedAnimations({ style: 'breath' }).style, 'breath', 'un joueur qui avait choisi la respiration la garde');
  assert.equal(normalizeLedAnimations({}).style, 'medley');
  for (const style of LED_AMBIENT_STYLES) {
    assert.ok(ledStyleLabel(style).length > 0 && ledStyleDetail(style).length > 0, `${style} : libellé et détail`);
  }
  assert.equal(ledStyleLabel('medley'), 'Florilège');
});

test(
  'Animations LED : écriture puis relecture, fichier absent ou abîmé = valeurs par défaut',
  withDir((dir) => {
    assert.deepEqual(readLedAnimations(dir), DEFAULT_LED_ANIMATIONS);
    const wanted = settings({ enabled: false, style: 'embers', brightness: 60, speed: 'slow', followTable: false, color: '#2f6bff', idleMinutes: 0 });
    writeLedAnimations(dir, wanted);
    assert.deepEqual(readLedAnimations(dir), wanted);
    assert.deepEqual(fs.readdirSync(dir), ['led-animations.json'], 'aucun fichier temporaire ne reste');
    fs.writeFileSync(ledAnimationsFile(dir), '{ pas du json');
    assert.deepEqual(readLedAnimations(dir), DEFAULT_LED_ANIMATIONS);
    fs.writeFileSync(ledAnimationsFile(dir), JSON.stringify({ brightness: 9999, style: 'wave' }));
    assert.equal(readLedAnimations(dir).brightness, 100);
    assert.equal(readLedAnimations(dir).style, 'wave');
  }),
);

test('Animations LED : les couleurs fixes proposées sont des #rrggbb distincts et se retrouvent par leur identité', () => {
  const hexes = LED_FIXED_COLORS.map((c) => c.hex);
  assert.equal(new Set(hexes).size, hexes.length);
  for (const c of LED_FIXED_COLORS) {
    assert.match(c.hex, /^#[0-9a-f]{6}$/);
    assert.equal(ledFixedColorId(c.hex), c.id);
  }
  assert.equal(ledFixedColorId('#123456'), undefined);
});

// --- Palette ----------------------------------------------------------------------------------

test('Animations LED : la palette garde la teinte de la table, saturée pour une LED, sans hasard', () => {
  for (const hex of ['#7fd6c9', '#d98cff', '#ffb36b', '#8fb4ff', '#ff8f8f']) {
    const p = ledPalette(hex);
    const [hTable] = rgbToHsv([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
    const [h, s, v] = rgbToHsv(p.primary);
    assert.ok(s >= 0.84, `${hex} : saturée (${s.toFixed(2)})`);
    assert.ok(v >= 0.99, `${hex} : pleine`);
    const gap = Math.abs(((h - hTable + 540) % 360) - 180);
    assert.ok(gap < 3, `${hex} : même teinte (écart ${gap.toFixed(1)}°)`);
    assert.deepEqual(ledPalette(hex), p);
  }
});

test('Animations LED : sans teinte, ou avec une teinte illisible, la palette est celle de la marque', () => {
  assert.deepEqual(ledPalette(undefined), ledPalette(LED_FIXED_COLORS[0].hex));
  assert.deepEqual(ledPalette('pas une couleur'), ledPalette(undefined));
});

test('Animations LED : un blanc chaud reste un blanc, il n’est pas teinté de force', () => {
  const [, s] = rgbToHsv(ledPalette('#ffffff').primary);
  assert.ok(s < 0.15);
});

test('Animations LED : la palette des couleurs de la table prend la première, la deuxième et la troisième, saturées', () => {
  const colors = ['#4a7fd0', '#d06aa8', '#d0a040'];
  const p = ledPaletteFrom(colors);
  assert.deepEqual(p.primary, ledPalette(colors[0]).primary, 'la dominante comme ledPalette');
  for (const [c, hex] of [
    [p.secondary, colors[1]!],
    [p.accent, colors[2]!],
  ] as const) {
    const [h, s, v] = rgbToHsv(c);
    assert.ok(hueGap(h, hexHue(hex)) < 3, `${hex} : même teinte`);
    assert.ok(s >= 0.84 && v >= 0.99, `${hex} : saturée et pleine`);
  }
  // Une seule couleur : les voisines de ledPalette ; aucune (ou illisible) : la marque.
  assert.deepEqual(ledPaletteFrom(['#4a7fd0']), ledPalette('#4a7fd0'));
  assert.deepEqual(ledPaletteFrom(undefined), ledPalette(undefined));
  assert.deepEqual(ledPaletteFrom(['bleu', '#4a7fd0']), ledPalette('#4a7fd0'), 'une couleur illisible est ignorée');
});

test('Animations LED : couleurs visées — la table (ses couleurs, sinon sa teinte, sinon la couleur fixe), ou la couleur fixe sans la suivre', () => {
  const follow = engineOf({ followTable: true, color: '#2f6bff' });
  assert.deepEqual(follow.targetColors('#ffb36b', ['#ff0000', '#00ff00']), ['#ff0000', '#00ff00']);
  assert.deepEqual(follow.targetColors('#ffb36b', []), ['#ffb36b']);
  assert.deepEqual(follow.targetColors(undefined, undefined), ['#2f6bff']);
  const fixed = engineOf({ followTable: false, color: '#2f6bff' });
  assert.deepEqual(fixed.targetColors('#ffb36b', ['#ff0000', '#00ff00']), ['#2f6bff']);
});

test('Animations LED : un style classique prend les couleurs de la table ; sans suivre la table, la couleur fixe', () => {
  const colors = ['#2f6bff', '#ff3d9a', '#ffb000'];
  const follow = engineOf({ style: 'drift', followTable: true, color: '#2bdc5a' });
  follow.setTint('#ff2a2a', 0, true, colors);
  assert.deepEqual(follow.palette(0), ledPaletteFrom(colors));
  // Sans palette mesurée : la teinte, comme avant.
  follow.setTint('#ff2a2a', 0, true);
  assert.deepEqual(follow.palette(0), ledPalette('#ff2a2a'));
  const fixed = engineOf({ style: 'drift', followTable: false, color: '#2bdc5a' });
  fixed.setTint('#ff2a2a', 0, true, colors);
  assert.deepEqual(fixed.palette(0), ledPalette('#2bdc5a'), 'couleur fixe, palette de la table ignorée');
  // Le fondu vers les couleurs de la table reste le même.
  const fade = engineOf({ style: 'drift' });
  fade.setTint('#ff2a2a', 0, true);
  fade.setTint(undefined, 10_000, false, colors);
  assert.notDeepEqual(fade.palette(10_450), ledPaletteFrom(colors), 'en cours de fondu');
  assert.deepEqual(fade.palette(11_000), ledPaletteFrom(colors));
});

test('Animations LED : le Florilège prend les couleurs de la table, ou la couleur fixe sans la suivre', () => {
  // Bleu de la table contre rouge fixe : sur cinq minutes, la couleur visée domine (les arcs-en-ciel s'équilibrent).
  const total = (over: Partial<LedAnimationSettings>, colors: string[]) => {
    const engine = engineOf({ style: 'medley', brightness: 100, ...over });
    engine.setTint(undefined, 0, true, colors);
    const s: [number, number, number] = [0, 0, 0];
    for (let t = 0; t < 300_000; t += 500) {
      const c = channels(engine.render(grid, t));
      for (let i = 0; i < 3; i++) s[i]! += c[i]!;
    }
    return s;
  };
  const blue = total({ followTable: true, color: '#ff2a2a' }, ['#2f6bff', '#3d5cff']);
  assert.ok(blue[2] > 1.5 * blue[0], `table bleue : du bleu (${blue.join(' / ')})`);
  const red = total({ followTable: false, color: '#ff2a2a' }, ['#2f6bff', '#3d5cff']);
  assert.ok(red[0] > 1.5 * red[2], `couleur fixe rouge : du rouge (${red.join(' / ')})`);
});

// --- Moteur -----------------------------------------------------------------------------------

test('Animations LED : aucune LED ne dépasse la luminosité maximale, quel que soit le style, la vitesse ou la transition', () => {
  for (const brightness of [5, ...LED_BRIGHTNESS_CHOICES]) {
    const cap = Math.round((255 * brightness) / 100);
    for (const style of LED_AMBIENT_STYLES) {
      for (const speed of LED_SPEEDS) {
        const engine = engineOf({ brightness, style, speed });
        engine.setTint('#ff8f8f', 0, true, ['#ff8f8f', '#ffffff', '#30ff60']);
        engine.sweep(1000, 1);
        engine.sweep(1100, -1);
        engine.arrive(1500);
        for (let t = 0; t < 12_000; t += 137) {
          const out = engine.render(grid, t);
          assert.equal(out.length, 60);
          assert.ok(peak(out) <= cap, `${style}/${speed}/${brightness} % à ${t} ms : ${peak(out)} > ${cap}`);
        }
        // L'ouverture, puis sa sortie avec un balayage par-dessus : toujours sous le plafond.
        engine.playIntro(20_000);
        for (let t = 20_000; t < 26_000; t += 61) assert.ok(peak(engine.render(grid, t)) <= cap, `ouverture ${style}/${brightness} % à ${t - 20_000} ms`);
        engine.endIntro(26_000);
        engine.sweep(26_100, 1);
        engine.arrive(26_300);
        for (let t = 26_000; t < 29_000; t += 61) assert.ok(peak(engine.render(grid, t)) <= cap, `sortie ${style}/${brightness} % à ${t - 26_000} ms`);
      }
    }
  }
});

test('Animations LED : l’ambiance seule laisse de la marge aux transitions', () => {
  const brightness = 100;
  for (const style of LED_AMBIENT_STYLES) {
    const engine = engineOf({ brightness, style });
    let high = 0;
    for (let t = 0; t < 60_000; t += 97) high = Math.max(high, peak(engine.render(grid, t)));
    // Gamma 2 : le plafond de 70 % donne au plus 49 % de la valeur maximale.
    assert.ok(high <= Math.ceil(255 * LED_AMBIENT_CEILING ** 2) + 1, `${style} : ${high}`);
    assert.ok(high > 0, `${style} : jamais noire`);
  }
});

test('Animations LED : chaque style allume la bande et change avec le temps', () => {
  for (const style of LED_AMBIENT_STYLES) {
    const engine = engineOf({ style, brightness: 100 });
    const frames = [0, 2500, 5000, 9000, 14_000].map((t) => engine.render(grid, t));
    assert.ok(frames.every((f) => sum(f) > 0), `${style} : allumée en permanence`);
    assert.ok(new Set(frames.map((f) => f.join(','))).size > 1, `${style} : l’image évolue`);
  }
});

test('Animations LED : une image ne dépend que de l’instant (aucun hasard), même d’un moteur à l’autre', () => {
  for (const style of LED_AMBIENT_STYLES.filter((s) => s !== 'medley')) {
    const a = new LedAmbientEngine(settings({ style }));
    const b = new LedAmbientEngine(settings({ style }));
    for (const t of [0, 333, 4242, 99_999]) assert.deepEqual(a.render(grid, t), b.render(grid, t), `${style} à ${t} ms`);
    assert.deepEqual(a.render(grid, 4242), a.render(grid, 4242));
  }
  // Florilège : à graine égale, la même suite d'images ; la graine seule change l'ordre des effets.
  const a = engineOf({ style: 'medley' }, 42);
  const b = engineOf({ style: 'medley' }, 42);
  for (const t of [0, 333, 4242, 45_000, 99_999]) assert.deepEqual(a.render(grid, t), b.render(grid, t), `medley à ${t} ms`);
});

test('Animations LED : le Florilège varie — plusieurs effets et familles en quelques minutes, une graine différente à chaque lancement', () => {
  const engine = engineOf({ style: 'medley', brightness: 100 });
  const effects = new Set<string>();
  const images = new Set<string>();
  for (let t = 0; t < 6 * 60_000; t += 1000) {
    images.add(engine.render(grid, t).join(','));
    effects.add(engine.medleyEffect!);
  }
  const families = new Set([...effects].map((id) => ledFxInfo(id)!.family));
  assert.ok(effects.size >= 6, `effets distincts en 6 min : ${[...effects].join(', ')}`);
  assert.ok(families.size >= 5, `familles distinctes : ${[...families].join(', ')}`);
  assert.ok(images.size > 120, `l’image change (${images.size} images distinctes sur 360)`);
  // Un changement d'écran passe à un autre effet.
  const before = engine.medleyEffect;
  engine.shuffle(400_000);
  assert.notEqual(engine.medleyEffect, before);
  // Écrans passés vite : un seul changement par LED_SHUFFLE_MIN_MS, pas une rafale de fondus.
  const shuffled = engine.medleyEffect;
  engine.shuffle(400_000 + LED_SHUFFLE_MIN_MS / 2);
  assert.equal(engine.medleyEffect, shuffled);
  engine.shuffle(400_000 + LED_SHUFFLE_MIN_MS);
  assert.notEqual(engine.medleyEffect, shuffled);
  // Un style classique n'a pas de séquenceur : shuffle n'y fait rien.
  const calm = engineOf({ style: 'breath' });
  calm.shuffle(1000);
  assert.equal(calm.medleyEffect, undefined);
  // Graine tirée au lancement : deux moteurs sans graine donnée ne la partagent pas (presque jamais).
  const firsts = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const e = new LedAmbientEngine(settings({ style: 'medley' }));
    const seq: string[] = [];
    for (let t = 0; t < 200_000; t += 5000) {
      e.render(grid, t);
      seq.push(e.medleyEffect!);
    }
    firsts.add(seq.join(','));
  }
  assert.ok(firsts.size > 1, 'des suites différentes d’un lancement à l’autre');
});

test('Animations LED : la matrice est rendue en entier, les bandes d’une LED aussi', () => {
  const engine = new LedAmbientEngine(settings({ style: 'wave', brightness: 100 }));
  assert.equal(engine.render({ width: 8, height: 4, arrangement: 'TopDownLeftRight' }, 3000).length, 8 * 4 * 3);
  assert.equal(engine.render({ width: 1, height: 1, arrangement: 'TopDownLeftRight' }, 3000).length, 3);
});

test('Animations LED : la luminosité réglée change bien le niveau', () => {
  const at = (brightness: number) => sum(new LedAmbientEngine(settings({ brightness, style: 'drift' })).render(grid, 5000));
  assert.ok(at(20) < at(40));
  assert.ok(at(40) < at(100));
});

test('Animations LED : la vitesse change le rythme', () => {
  const at = (speed: 'slow' | 'fast') => new LedAmbientEngine(settings({ speed, style: 'breath', brightness: 100 })).render(grid, 3000).join(',');
  assert.notEqual(at('slow'), at('fast'));
});

test('Animations LED : le fondu de palette passe par le milieu puis arrive à la nouvelle teinte', () => {
  const engine = new LedAmbientEngine(settings());
  engine.setTint('#d98cff', 0, true);
  const from = engine.palette(0).primary;
  engine.setTint('#ffb36b', 10_000);
  assert.ok(engine.busy(10_100));
  assert.deepEqual(engine.palette(10_000).primary, from, 'départ : la palette montrée');
  const mid = engine.palette(10_450).primary;
  const end = engine.palette(11_000).primary;
  assert.deepEqual(end, ledPalette('#ffb36b').primary);
  assert.notDeepEqual(mid, from);
  assert.notDeepEqual(mid, end);
  assert.equal(engine.busy(11_000), false);
  // Un fondu interrompu repart de ce qui est montré, sans saut.
  const e2 = new LedAmbientEngine(settings());
  e2.setTint('#d98cff', 0, true);
  e2.setTint('#ffb36b', 1000);
  const shown = e2.palette(1450).primary;
  e2.setTint('#8fb4ff', 1450);
  assert.deepEqual(e2.palette(1450).primary, shown);
});

test('Animations LED : sans suivre la table, la teinte est ignorée et la couleur fixe reste', () => {
  const engine = new LedAmbientEngine(settings({ followTable: false, color: '#2f6bff' }));
  engine.setTint('#ffb36b', 0, true);
  assert.deepEqual(engine.palette(0), ledPalette('#2f6bff'));
  const follow = new LedAmbientEngine(settings({ followTable: true, color: '#2f6bff' }));
  follow.setTint('#ffb36b', 0, true);
  assert.deepEqual(follow.palette(0), ledPalette('#ffb36b'));
  follow.setTint(undefined, 0, true);
  assert.deepEqual(follow.palette(0), ledPalette('#2f6bff'), 'table sans teinte : couleur fixe');
});

test('Animations LED : le balayage traverse la bande dans le sens demandé, puis l’ambiance reprend', () => {
  const style = { style: 'breath' as const, brightness: 100 };
  const lit = (dir: 1 | -1, at: number) => {
    const engine = new LedAmbientEngine(settings(style));
    const plain = engine.render(grid, 100_000 + at);
    engine.sweep(100_000, dir);
    const out = engine.render(grid, 100_000 + at);
    let best = 0;
    let where = 0;
    for (let k = 0; k < 20; k++) {
      const gain = out[k * 3]! + out[k * 3 + 1]! + out[k * 3 + 2]! - (plain[k * 3]! + plain[k * 3 + 1]! + plain[k * 3 + 2]!);
      if (gain > best) {
        best = gain;
        where = k;
      }
    }
    return { best, where };
  };
  const early = lit(1, 250);
  const late = lit(1, 600);
  assert.ok(early.best > 0 && late.best > 0, 'le balayage se voit');
  assert.ok(late.where > early.where, 'vers la fin de la bande');
  const back = lit(-1, 250);
  const backLate = lit(-1, 600);
  assert.ok(backLate.where < back.where, 'vers le début de la bande');
  const engine = new LedAmbientEngine(settings(style));
  const plain = engine.render(grid, 105_000);
  engine.sweep(100_000, 1);
  assert.equal(engine.busy(100_500), true);
  assert.equal(engine.busy(101_000), false);
  assert.deepEqual(engine.render(grid, 105_000), plain, 'après le balayage, l’ambiance seule');
});

test('Animations LED : l’arrivée sur la fiche pulse puis s’éteint', () => {
  const engine = new LedAmbientEngine(settings({ style: 'drift', brightness: 100 }));
  const plain = sum(engine.render(grid, 200_000 + 150));
  engine.arrive(200_000);
  assert.ok(sum(engine.render(grid, 200_000 + 150)) > plain, 'une pulsation s’ajoute');
  assert.equal(engine.busy(200_000 + 1100), true);
  assert.equal(engine.busy(200_000 + 1300), false);
  assert.deepEqual(engine.render(grid, 205_000), new LedAmbientEngine(settings({ style: 'drift', brightness: 100 })).render(grid, 205_000));
});

test('Animations LED : animations éteintes, tout est noir, ambiance comme ouverture', () => {
  const engine = engineOf({ enabled: false, brightness: 100 });
  for (const t of [0, 3000, 60_000]) assert.equal(sum(engine.render(grid, t)), 0);
  engine.playIntro(100_000);
  for (let t = 100_000; t < 106_000; t += 100) assert.equal(sum(engine.render(grid, t)), 0, `ouverture à ${t - 100_000} ms`);
});

// --- Ouverture ---------------------------------------------------------------------------------

/** Rang de la LED la plus vive. */
const brightest = (rgb: Uint8Array) => {
  let best = -1;
  let where = 0;
  for (let k = 0; k < rgb.length / 3; k++) {
    const v = rgb[k * 3]! + rgb[k * 3 + 1]! + rgb[k * 3 + 2]!;
    if (v > best) {
      best = v;
      where = k;
    }
  }
  return where;
};

test('Ouverture des LED : noire avant la mise sous tension, puis une lueur discrète', () => {
  for (const ms of [-500, 0, 100, INTRO_TIMELINE.dmdPower - 1]) assert.equal(sum(renderLedIntro(grid, ms, 1)), 0, `${ms} ms`);
  assert.equal(sum(renderLedIntro(grid, NaN, 1)), 0);
  const glow = renderLedIntro(grid, 1100, 1);
  assert.ok(sum(glow) > 0, 'la mise sous tension se voit');
  assert.ok(peak(glow) < 255 * 0.4, `discrète (${peak(glow)})`);
});

test('Ouverture des LED : la bille monte jusqu’à l’ignition, le pic est à l’ignition', () => {
  const T = INTRO_TIMELINE;
  // La bille monte vers la fin de la bande.
  const low = brightest(renderLedIntro(grid, 1800, 1));
  const high = brightest(renderLedIntro(grid, 2300, 1));
  assert.ok(high > low, `la bille monte (${low} → ${high})`);
  // Le pic : l'éclair de l'ignition.
  const atIgnition = renderLedIntro(grid, T.ignition + 30, 1);
  assert.ok(peak(atIgnition) >= 240, `éclair (${peak(atIgnition)})`);
  for (const ms of [800, 1800, T.topperSweep + 300, T.sheen + 300, T.end + 1000, 20_000]) {
    assert.ok(sum(atIgnition) > sum(renderLedIntro(grid, ms, 1)), `l’ignition (${sum(atIgnition)}) l’emporte sur ${ms} ms`);
  }
  // Plafond et aucun hasard.
  for (let ms = 0; ms < 8000; ms += 37) {
    assert.ok(peak(renderLedIntro(grid, ms, 0.4)) <= Math.round(255 * 0.4), `${ms} ms sous le plafond`);
  }
  assert.deepEqual(renderLedIntro(grid, 2777, 1), renderLedIntro(grid, 2777, 1));
  assert.equal(renderLedIntro({ width: 8, height: 4, arrangement: 'TopDownLeftRight' }, 2500, 1).length, 8 * 4 * 3);
});

test('Ouverture des LED : après la fin, l’ambiance posée, allumée et sous la marge de l’ambiance', () => {
  const settled: Uint8Array[] = [];
  for (let ms = INTRO_TIMELINE.end + 100; ms < 60_000; ms += 499) settled.push(renderLedIntro(grid, ms, 1));
  assert.ok(settled.every((f) => sum(f) > 0), 'jamais noire');
  assert.ok(new Set(settled.map((f) => f.join(','))).size > 10, 'elle vit');
  const high = Math.max(...settled.map(peak));
  assert.ok(high <= Math.ceil(255 * LED_AMBIENT_CEILING ** 2) + 1, `sous la marge (${high})`);
  // Aux couleurs de la marque : sarcelle et vert, ni rouge ni violet.
  const [r, g, b] = settled.map(channels).reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]);
  assert.ok(g > r && g > b * 0.8, `sarcelle et vert (${r} / ${g} / ${b})`);
});

test('Ouverture des LED : le moteur la cale sur l’instant de départ, même rejointe en retard, puis passe au menu sans noir', () => {
  const start = 50_000;
  const engine = engineOf({ style: 'medley', brightness: 100 });
  engine.setTint('#ff3d9a', 0, true);
  engine.playIntro(start);
  assert.equal(engine.introPlaying, true);
  assert.equal(engine.busy(start + 60_000), true);
  // Rejointe en retard (port ouvert après le départ) : la même image que l'ouverture à cet instant.
  assert.deepEqual(engine.render(grid, start + INTRO_TIMELINE.ignition + 30), renderLedIntro(grid, INTRO_TIMELINE.ignition + 30, 1));
  assert.deepEqual(engine.render(grid, start + 7000), renderLedIntro(grid, 7000, 1));
  // Sortie : fondu de l'image d'ouverture vers l'ambiance, jamais noir.
  const leave = start + 9000;
  const introSum = sum(engine.render(grid, leave));
  engine.endIntro(leave);
  assert.equal(engine.introPlaying, false);
  const sums: number[] = [];
  for (let t = leave; t <= leave + 2000; t += 40) sums.push(sum(engine.render(grid, t)));
  const ambientSum = sums[sums.length - 1]!;
  const floor = 0.2 * Math.min(introSum, ambientSum);
  assert.ok(ambientSum > 0 && introSum > 0);
  assert.ok(Math.min(...sums) >= floor, `aucun creux noir (min ${Math.min(...sums)}, seuil ${floor.toFixed(0)})`);
  assert.ok(Math.abs(sums[0]! - introSum) <= 60, 'le fondu part de l’image montrée (aux arrondis près)');
  assert.equal(engine.busy(leave + 1600), false, 'fondu fini');
  // Une sortie sans ouverture en cours ne change rien.
  const plain = engineOf({ style: 'drift' });
  const before = plain.render(grid, 3000);
  plain.endIntro(3000);
  assert.deepEqual(plain.render(grid, 3000), before);
});

// --- Contrôleur de l'application ---------------------------------------------------------------

interface Service {
  configure(l: CabinetLeds | undefined): void;
  start(): Promise<{ state: string }>;
  stop(): Promise<void>;
  setColor(target: string, color: readonly [number, number, number], layer?: string): void;
  blackout(): void;
  step(): Promise<void>;
  gameStarted(): Promise<void>;
  gameEnded(): void;
  status(): { state: string };
  readonly leds: CabinetLeds | undefined;
  simulation: { device: { shownOutput(output: number, count: number): Uint8Array } } | undefined;
}
interface Controller {
  update(c: { phase: string; tableKey?: string; index?: number; ficheKey?: string; tint?: string; palette?: readonly string[]; introStartedAt?: number }): void;
  settings(): LedAnimationSettings;
  change(patch: Partial<LedAnimationSettings>): void;
  available(): boolean;
  readonly running: boolean;
  dispose(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const driver = require(path.resolve(__dirname, '../../../../app/dist/led-live.js')) as { createLedService(o: Record<string, unknown>): Service };
const animationsModule = require(path.resolve(__dirname, '../../../../app/dist/led-animations.js')) as {
  createLedAnimations(o: Record<string, unknown>): Controller;
  LED_AMBIENT_PHASES: readonly string[];
  LED_INTRO_PHASE: string;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise<void>((resolve) => setImmediate(resolve));
};

interface Bench {
  dir: string;
  service: Service;
  controller: Controller;
  /** Minuterie factice : le test fait battre les images à la main. */
  timer: { active: boolean; beat(): Promise<void> };
  clock: { now: number };
  idle: { ms: number };
  config: { leds: CabinetLeds | undefined };
}
function bench(dir: string, leds: CabinetLeds | undefined = teensy([strip()]), initial?: Partial<LedAnimationSettings>): Bench {
  if (initial) writeLedAnimations(dir, settings(initial));
  const service = driver.createLedService({ simulated: true, manual: true, resumeDelayMs: 10 });
  const config = { leds };
  const clock = { now: 1_000_000 };
  const idle = { ms: 0 };
  let beat: (() => void) | undefined;
  const timer = {
    get active() {
      return beat !== undefined;
    },
    async beat() {
      beat?.();
      await service.step();
    },
  };
  const controller = animationsModule.createLedAnimations({
    service,
    dataDir: dir,
    leds: () => config.leds,
    idleFor: () => idle.ms,
    now: () => clock.now,
    seed: 7,
    setInterval: (run: () => void) => {
      beat = run;
      return 1;
    },
    clearInterval: () => {
      beat = undefined;
    },
  });
  return { dir, service, controller, timer, clock, idle, config };
}
const shown = (b: Bench, count = 20) => b.service.simulation!.device.shownOutput(0, count);

test(
  'Animations LED : au repos dans un menu, les bandes s’allument d’elles-mêmes',
  withDir(async (dir) => {
    const b = bench(dir);
    assert.equal(b.controller.available(), true);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0, tint: '#7fd6c9' });
    await settle();
    assert.equal(b.service.status().state, 'running');
    assert.equal(b.controller.running, true);
    await b.timer.beat();
    assert.ok(sum(shown(b)) > 0, 'les LED montrent quelque chose');
    assert.ok(peak(shown(b)) <= Math.round((255 * DEFAULT_LED_ANIMATIONS.brightness) / 100), 'sous la luminosité réglée');
    b.controller.dispose();
    await b.service.stop();
  }),
);

test(
  'Animations LED : dès qu’une partie se prépare, l’ambiance se tait et rien ne rouvre le port',
  withDir(async (dir) => {
    const b = bench(dir);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.timer.beat();
    assert.ok(sum(shown(b)) > 0);
    // La partie se prépare : le pilote rend le port.
    await b.service.gameStarted();
    b.controller.update({ phase: 'loading', tableKey: 'a.vpx', index: 0 });
    await settle();
    assert.equal(b.controller.running, false, 'plus de minuterie');
    assert.equal(b.service.status().state, 'paused-by-game');
    for (const phase of ['loading', 'playing', 'intro']) {
      b.controller.update({ phase });
      await settle();
      assert.equal(b.controller.running, false, phase);
      assert.equal(b.service.status().state, 'paused-by-game', `${phase} : le port reste à la partie`);
    }
    // Même un écran de menu pendant la partie (message, pause) ne rouvre rien.
    b.controller.update({ phase: 'message' });
    await settle();
    assert.equal(b.service.status().state, 'paused-by-game');
    assert.equal(b.controller.running, false);
    b.controller.dispose();
  }),
);

test(
  'Animations LED : après la partie, le pilote rouvre le port et l’ambiance revient',
  withDir(async (dir) => {
    const b = bench(dir);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.service.gameStarted();
    b.controller.update({ phase: 'playing' });
    await settle();
    b.service.gameEnded();
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    await settle();
    assert.notEqual(b.service.status().state, 'paused-by-game');
    b.controller.dispose();
    await b.service.stop();
  }),
);

test('Animations LED : seuls la roue, les menus, les messages et le Juke-box sont des écrans d’ambiance', () => {
  assert.deepEqual([...animationsModule.LED_AMBIENT_PHASES].sort(), ['confirmQuit', 'jukebox', 'library', 'menu', 'message']);
  for (const phase of ['intro', 'loading', 'playing']) assert.ok(!animationsModule.LED_AMBIENT_PHASES.includes(phase), phase);
  assert.equal(animationsModule.LED_INTRO_PHASE, 'intro', 'l’ouverture a son animation à elle');
});

test(
  'Animations LED : l’ouverture joue à l’horloge des écrans, même port ouvert en retard, puis la roue sans noir',
  withDir(async (dir) => {
    const b = bench(dir);
    // Fenêtres pas encore prêtes : pas d'instant de départ, rien ne s'allume.
    b.controller.update({ phase: 'intro' });
    await settle();
    assert.equal(b.controller.running, false);
    assert.equal(b.service.status().state, 'closed', 'aucun port ouvert avant le départ');
    // Les animations partent ; le port s'ouvre (en retard : l'ignition est déjà là).
    b.controller.update({ phase: 'intro', introStartedAt: b.clock.now - INTRO_TIMELINE.ignition - 30, tint: '#ff3d9a', palette: ['#ff3d9a'] });
    await settle();
    assert.equal(b.controller.running, true);
    await b.timer.beat();
    const cap = Math.round((255 * DEFAULT_LED_ANIMATIONS.brightness) / 100);
    assert.ok(peak(shown(b)) >= cap - 15, `l’éclair de l’ignition (${peak(shown(b))} / ${cap})`);
    assert.ok(peak(shown(b)) <= cap);
    // Ambiance posée de l'ouverture, puis le premier bouton : la roue, sans passer par le noir.
    b.clock.now += 8000;
    await b.timer.beat();
    const settled = sum(shown(b));
    assert.ok(settled > 0);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0, tint: '#ff3d9a', palette: ['#ff3d9a'] });
    for (let i = 0; i < 40; i++) {
      b.clock.now += 40;
      await b.timer.beat();
      assert.ok(sum(shown(b)) > 0, `aucun noir à ${i * 40} ms de la sortie`);
    }
    assert.equal(b.controller.running, true, 'l’ambiance des menus continue');
    b.controller.dispose();
    await b.service.stop();
  }),
);

test(
  'Animations LED : animations éteintes ou sans bande, l’ouverture n’allume rien et n’ouvre aucun port',
  withDir(async (dir) => {
    for (const c of [
      { leds: teensy([strip()]), initial: { enabled: false } as Partial<LedAnimationSettings> },
      { leds: undefined, initial: undefined },
    ]) {
      const sub = fs.mkdtempSync(path.join(dir, 'o-'));
      const b = bench(sub, c.leds, c.initial);
      b.config.leds = c.leds;
      b.controller.update({ phase: 'intro', introStartedAt: b.clock.now - 2400 });
      await settle();
      assert.equal(b.controller.running, false);
      assert.equal(b.timer.active, false);
      assert.equal(b.service.status().state, 'closed');
      b.controller.dispose();
    }
  }),
);

test(
  'Animations LED : rien ne tourne sans bande, avec les animations éteintes, ou sur une carte qui porte ses bandes',
  withDir(async (dir) => {
    const cases: { name: string; leds: CabinetLeds | undefined; initial?: Partial<LedAnimationSettings> }[] = [
      { name: 'aucune description', leds: undefined },
      { name: 'aucune bande', leds: teensy([]) },
      { name: 'animations éteintes', leds: teensy([strip()]), initial: { enabled: false } },
      { name: 'carte DudesCab', leds: { controller: 'DudesCab', port: '', strips: [strip()] } },
    ];
    for (const c of cases) {
      const sub = fs.mkdtempSync(path.join(dir, 'c-'));
      const b = bench(sub, c.leds, c.initial);
      b.config.leds = c.leds;
      b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
      await settle();
      assert.equal(b.controller.running, false, `${c.name} : pas de minuterie`);
      assert.equal(b.timer.active, false, `${c.name} : aucune minuterie posée`);
      assert.equal(b.service.status().state, 'closed', `${c.name} : aucun port ouvert`);
      b.controller.dispose();
    }
  }),
);

test(
  'Animations LED : après l’inactivité réglée, les LED s’éteignent, et reviennent au premier geste',
  withDir(async (dir) => {
    const b = bench(dir, teensy([strip()]), { idleMinutes: 5 });
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.timer.beat();
    assert.ok(sum(shown(b)) > 0);
    b.idle.ms = 5 * 60_000 + 1;
    await b.timer.beat();
    assert.equal(b.controller.running, false, 'minuterie arrêtée');
    await b.service.step();
    assert.equal(sum(shown(b)), 0, 'bande éteinte');
    // Un geste (l’inactivité repart de zéro) : l’écran change, l’ambiance revient.
    b.idle.ms = 0;
    b.controller.update({ phase: 'menu', tableKey: 'b.vpx', index: 1 });
    await settle();
    assert.equal(b.controller.running, true);
    await b.timer.beat();
    assert.ok(sum(shown(b)) > 0);
    b.controller.dispose();
    await b.service.stop();
  }),
);

test(
  'Animations LED : « jamais » n’éteint jamais',
  withDir(async (dir) => {
    const b = bench(dir, teensy([strip()]), { idleMinutes: 0 });
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    b.idle.ms = 99 * 3_600_000;
    await b.timer.beat();
    assert.ok(sum(shown(b)) > 0);
    b.controller.dispose();
    await b.service.stop();
  }),
);

test(
  'Animations LED : un changement de réglage est enregistré et se voit aussitôt ; éteindre rend le port',
  withDir(async (dir) => {
    const b = bench(dir);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.timer.beat();
    b.controller.change({ brightness: 10 });
    assert.equal(readLedAnimations(dir).brightness, 10, 'écrit sur le disque');
    await b.timer.beat();
    assert.ok(peak(shown(b)) <= Math.round(25.5), 'plafonnée à 10 %');
    b.controller.change({ brightness: 7777 });
    assert.equal(b.controller.settings().brightness, 100, 'valeur bornée');
    b.controller.change({ enabled: false });
    await settle();
    assert.equal(readLedAnimations(dir).enabled, false);
    assert.equal(b.controller.running, false);
    assert.equal(b.service.status().state, 'closed', 'le port est rendu');
    b.controller.dispose();
  }),
);

test(
  'Animations LED : l’essai des bandes de l’écran de configuration garde la main',
  withDir(async (dir) => {
    const b = bench(dir);
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.timer.beat();
    // L’écran de configuration ouvre la liaison avec une autre description (essai) et colore une LED.
    await b.service.stop();
    b.service.configure(teensy([strip({ height: 6 })]));
    await b.service.start();
    b.service.setColor('*', [255, 0, 0], 'test');
    b.controller.update({ phase: 'menu', tableKey: 'b.vpx', index: 1 });
    await settle();
    assert.equal(b.controller.running, false, 'pas de minuterie pendant l’essai');
    assert.equal(b.service.leds?.strips[0]?.height, 6, 'la description d’essai est intacte');
    await b.service.step();
    assert.equal(peak(b.service.simulation!.device.shownOutput(0, 6)), 255, 'la couleur d’essai pleine reste affichée, sans ambiance par-dessus');
    b.controller.dispose();
    await b.service.stop();
  }),
);

test(
  'Animations LED : le balayage de la roue part au changement de table, pas à un simple nouvel état',
  withDir(async (dir) => {
    const b = bench(dir, teensy([strip()]), { style: 'drift', brightness: 100 });
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await settle();
    await b.timer.beat();
    const calm = Array.from(shown(b));
    b.controller.update({ phase: 'menu', tableKey: 'a.vpx', index: 0 });
    await b.timer.beat();
    assert.deepEqual(Array.from(shown(b)), calm, 'même table : même image (horloge figée)');
    b.controller.update({ phase: 'menu', tableKey: 'b.vpx', index: 1 });
    b.clock.now += 300;
    await b.timer.beat();
    assert.ok(sum(shown(b)) > sum(Uint8Array.from(calm)), 'nouvelle table : un balayage s’ajoute');
    b.clock.now += 5000;
    await b.timer.beat();
    b.controller.dispose();
    await b.service.stop();
  }),
);
