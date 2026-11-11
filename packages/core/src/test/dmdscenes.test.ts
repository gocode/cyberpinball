// Scènes du DMD du menu vivant (dmdscenes.ts, livedmd.ts) : les transitions selon la page
// d'arrivée, le détail de la wheel (tons, bande choisie, ouverture jouée une fois), les six
// intermèdes un cycle sur deux, jamais deux fois le même de suite, et l'afficheur jamais vide.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DMD_INTERLUDES,
  LIVE_DMD_SCENES,
  interludeOrder,
  interludePage,
  liveDmdProgram,
  wheelDetail,
  wheelPage,
  type DmdInterludeName,
} from '../dmdscenes';
import type { TableRecords } from '../highscores';
import {
  DMD_ALTERNANCE,
  DMD_HEIGHT,
  DMD_TRANSITIONS,
  DMD_TRANSITION_MS,
  DMD_WIDTH,
  LIVE_DMD_TIMING,
  LiveDmdProgram,
  liveDmdPages,
  sameDots,
  transitionTo,
  type DmdDots,
} from '../livedmd';
import type { RgbaImage } from '../png';

const NOW = () => new Date(2026, 10, 9, 18, 42, 10, 200);
const RECORDS: TableRecords = {
  file: 'x',
  storage: 'bttf',
  credits: 3,
  scores: [1, 2].map((rank) => ({ rank, score: 80_000_000 - rank * 10_000_000, initials: 'ACE' })),
};
const BTTF = { title: 'Back to the Future', manufacturer: 'Data East', year: 1990, records: RECORDS, now: NOW };

/**
 * Wheel d'essai : un médaillon opaque de 200 × 200 pixels sur fond transparent, uni et sombre,
 * avec des rayures franches (un logotype) des lignes 130 à 160 ; `width`, `height` pour une
 * wheel en bandeau.
 */
function medallion(width = 200, height = 200, band = [130, 160]): RgbaImage {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inside = width === height ? Math.hypot(x - width / 2, y - height / 2) < width / 2 - 2 : true;
      if (!inside) continue;
      const stripes = y >= band[0]! && y < band[1]! && Math.floor(x / 6) % 2 === 0;
      const v = stripes ? 250 : 70 + (x % 40);
      data.set([v, Math.round(v * 0.6), 30, 255], i);
    }
  }
  return { width, height, data };
}

const filled = (v: number): DmdDots => new Uint8Array(DMD_WIDTH * DMD_HEIGHT).fill(v);

test('transitions : les trois effets Soie en alternance, l’allumage vers la wheel, aucune entre deux records', () => {
  assert.deepEqual(DMD_ALTERNANCE, ['fils', 'wipe', 'scintille']);
  assert.equal(transitionTo('title', 'press-start', 0), 'fils');
  assert.equal(transitionTo('press-start', 'records', 1), 'wipe');
  assert.equal(transitionTo('records', 'clock', 2), 'scintille');
  assert.equal(transitionTo('clock', 'credits', 3), 'fils');
  assert.equal(transitionTo('records', 'records', 1), undefined);
  assert.equal(transitionTo('title', 'wheel', 2), 'light');
  // Durées, multiples d'une image (40 ms).
  assert.deepEqual(DMD_TRANSITION_MS, { push: 160, slide: 240, wipe: 320, dissolve: 320, light: 400, fils: 520, scintille: 440 });
  for (const ms of Object.values(DMD_TRANSITION_MS)) assert.equal(ms % 40, 0);
  // Chacune part de l'ancienne image et arrive à la nouvelle.
  const a = filled(3);
  const b = filled(9);
  for (const [name, at] of Object.entries(DMD_TRANSITIONS)) {
    assert.ok(sameDots(at(a, b, 0), a) || name === 'wipe', `${name} : départ`);
    assert.ok(sameDots(at(a, b, 1), b), `${name} : arrivée`);
  }
  // Le volet a un front lumineux ; la dissolution mêle les deux images à mi-course ; le glissement suit le sens de la roue.
  assert.ok(DMD_TRANSITIONS.wipe(a, b, 0.5).includes(15));
  const half = DMD_TRANSITIONS.dissolve(a, b, 0.5);
  const share = half.filter((v) => v === 9).length / half.length;
  assert.ok(share > 0.4 && share < 0.6, `dissolution à mi-course : ${share}`);
  const left = DMD_TRANSITIONS.slide(a, b, 0.5, 1);
  const right = DMD_TRANSITIONS.slide(a, b, 0.5, -1);
  assert.equal(left[DMD_WIDTH - 1], 9, 'vers la suivante : la nouvelle arrive par la droite');
  assert.equal(right[0], 9, 'vers la précédente : par la gauche');
  // Les fils ont leur tête au plein éclat et une rémanence ; le scintillement, un front au plein éclat.
  assert.ok(DMD_TRANSITIONS.fils(a, b, 0.5).includes(15));
  assert.ok(DMD_TRANSITIONS.scintille(a, b, 0.5).includes(15));
});

test('programme : les effets Soie se suivent en boucle, deux records sans mouvement', () => {
  const program = new LiveDmdProgram(liveDmdPages(BTTF));
  const ids = program.pages.map((p) => p.id);
  const r1 = ids.indexOf('records');
  assert.equal(program.startOf(r1 + 1), program.startOf(r1) + LIVE_DMD_TIMING.record, 'deux records : remplacés sans mouvement');
  // Les transitions de la boucle, dans l'ordre : fils, volet, scintillement, fils…
  const played = ids.map((_, i) => program.transitionAfter(i)).filter((x) => x !== undefined && x !== 'light');
  assert.ok(played.length >= 3, `${played.length} transitions`);
  played.forEach((name, i) => assert.equal(name, DMD_ALTERNANCE[i % 3], `transition ${i}`));
  // Chaque page commence après la précédente, sa durée et celle de sa transition.
  for (let i = 1; i < ids.length; i++) {
    const before = program.transitionAfter(i - 1);
    assert.equal(program.startOf(i), program.startOf(i - 1) + program.pages[i - 1]!.hold + (before ? DMD_TRANSITION_MS[before] : 0));
  }
  // En pleine transition : la page de départ, une image qui bouge, un éclat au plein.
  const first = program.transitionAfter(0)!;
  const mid = program.at(program.startOf(1) - DMD_TRANSITION_MS[first] / 2);
  assert.equal(mid.page, ids[0]);
  assert.ok(mid.moving && mid.dots.includes(15));
});

test('wheel : en tons du directeur artistique, 112 points au plus, l’afficheur posé sur la bande la plus riche', () => {
  const detail = wheelDetail(medallion())!;
  assert.ok(detail, 'wheel lue');
  assert.ok(detail.width <= LIVE_DMD_SCENES.wheelSize && detail.height <= LIVE_DMD_SCENES.wheelSize);
  assert.equal(detail.dots.length, detail.width * detail.height);
  // Pas de nuance 1 isolée du fond par tramage : 0, puis des ombres, volumes, contours ; jamais au-delà de 15.
  assert.ok(detail.dots.every((v) => v <= 15));
  assert.ok(detail.dots.includes(15), 'des éclats');
  // Les rayures (lignes 130 à 160 sur 200, soit 73 à 90 sur 112) : la bande montrée les couvre à la fin du glissement.
  const top = (130 / 200) * detail.height;
  const bottom = (160 / 200) * detail.height;
  assert.ok(detail.to <= top + 4 && detail.to + DMD_HEIGHT >= bottom - 4, `bande ${detail.to}–${detail.to + DMD_HEIGHT} pour ${top}–${bottom}`);
  assert.equal(detail.to - detail.from, 2 * LIVE_DMD_SCENES.wheelTravel, 'glissement de 16 points');
  // Rien de visible : pas de détail.
  assert.equal(wheelDetail({ width: 10, height: 10, data: Buffer.alloc(400) }), undefined);
  // Une wheel en bandeau plus basse que l'afficheur : centrée, sans glissement.
  const strip = wheelDetail(medallion(400, 60, [0, 60]))!;
  assert.ok(strip.height < DMD_HEIGHT);
  assert.equal(strip.from, strip.to);
  const page = wheelPage(strip).dots(0);
  const rows = new Set<number>();
  page.forEach((v, i) => v && rows.add(Math.floor(i / DMD_WIDTH)));
  assert.ok(Math.min(...rows) > 0 && Math.max(...rows) < DMD_HEIGHT - 1, 'bandeau centré en hauteur');
});

test('détail de la wheel : 800 ms après l’arrivée, allumé sur le titre, joué une seule fois', () => {
  const wheel = wheelDetail(medallion())!;
  const program = liveDmdProgram({ ...BTTF, wheel });
  const after = LIVE_DMD_SCENES.wheelAfter;
  assert.equal(program.at(0).page, 'title');
  assert.equal(program.at(after - 40).page, 'title');
  const lighting = program.at(after + LIVE_DMD_TIMING.light / 2);
  assert.ok(lighting.moving, 'allumage en cours');
  assert.equal(program.at(after + LIVE_DMD_TIMING.light + 10).page, 'wheel');
  const page = wheelPage(wheel);
  // Glissement, puis le reflet relève quelques points de 2 nuances au plus.
  const { wheelSlide, wheelStill, wheelShine } = LIVE_DMD_SCENES;
  assert.ok(!sameDots(page.dots(0), page.dots(wheelSlide)), 'la wheel glisse');
  const still = page.dots(wheelSlide + 10);
  const shine = page.dots(wheelSlide + wheelStill + wheelShine / 2);
  let raised = 0;
  still.forEach((v, i) => {
    assert.ok(shine[i]! - v <= 2);
    if (shine[i]! > v) raised++;
  });
  assert.ok(raised > 10, 'un reflet passe');
  // Toute l'ouverture : 800 ms de titre, l'allumage, 1 760 ms de wheel, les fils (premier effet Soie) vers le titre.
  assert.equal(program.openingLength, after + LIVE_DMD_TIMING.light + page.hold + LIVE_DMD_TIMING.fils);
  assert.equal(program.at(program.openingLength).page, 'title');
  assert.ok(!program.pages.some((p) => p.id === 'wheel'), 'la boucle ne la rejoue pas');
  // Sans wheel connue : pas d'ouverture.
  assert.equal(liveDmdProgram(BTTF).openingLength, 0);
  assert.equal(liveDmdProgram(undefined).openingLength, 0, 'sans table, pas de wheel');
});

test('intermèdes : six scènes de 1,6 à 3 s, nerveuses, calculées une fois', () => {
  const names = Object.keys(DMD_INTERLUDES) as DmdInterludeName[];
  assert.deepEqual(names, ['bumpers', 'lanceur', 'flippers', 'cibles', 'verrou', 'multibille']);
  for (const name of names) {
    const page = interludePage(name);
    assert.equal(page, interludePage(name), `${name} : calculée une fois`);
    assert.equal(page.id, 'interlude');
    assert.equal(page.hold % 40, 0, `${name} : une durée en images entières`);
    assert.ok(page.hold >= 1600 && page.hold <= 3000, `${name} : ${page.hold} ms`);
    // La bille au plein éclat passe, et la scène bouge.
    const frames = Array.from({ length: page.hold / 40 }, (_, i) => page.dots(i * 40));
    assert.ok(frames.some((d) => d.includes(15)), `${name} : un plein éclat`);
    assert.ok(new Set(frames.map((d) => d.join())).size > page.hold / 80, `${name} : la scène bouge`);
  }
  // Les cibles et le verrou concluent par leur texte.
  const textFrames = (name: DmdInterludeName) => {
    const page = interludePage(name);
    return Array.from({ length: page.hold / 40 }, (_, i) => page.dots(i * 40));
  };
  for (const name of ['cibles', 'verrou'] as const) assert.ok(textFrames(name).some((d) => d.filter((v) => v === 14).length > 80), `${name} : son texte`);
});

test('rotation : un intermède un cycle sur deux, après le dernier record, jamais le même deux fois de suite', () => {
  const program = liveDmdProgram(BTTF);
  const ids = program.pages.map((p) => p.id);
  const base = liveDmdPages(BTTF).length;
  const scenes = program.pages.filter((p) => p.id === 'interlude');
  assert.equal(scenes.length, 6, 'les six tour à tour');
  assert.equal(new Set(scenes).size, 6, 'six scènes différentes');
  assert.equal(ids.length, 12 * base + 6, 'douze cycles, dont six avec un intermède');
  // Le premier cycle en a un, juste après le dernier record ; le suivant n'en a pas.
  assert.deepEqual(ids.slice(0, base + 1), ['title', 'press-start', 'records', 'records', 'interlude', 'clock', 'credits']);
  assert.ok(!ids.slice(base + 1, 2 * base + 1).includes('interlude'));
  // Sans records : après PRESS START.
  const t2 = liveDmdProgram({ title: 'Terminator 2', now: NOW }).pages.map((p) => p.id);
  assert.deepEqual(t2.slice(0, 5), ['title', 'press-start', 'interlude', 'clock', 'credits']);
  // Toutes les 40 à 50 s : deux cycles de 18 s (2 records) à 23 s (4 records).
  const every = program.cycle / 6;
  assert.ok(every > 35_000 && every < 55_000, `un intermède toutes les ${every} ms`);
  // Deux tables ne commencent pas toutes par la même scène.
  const firsts = new Set(['Back to the Future', 'Terminator 2', 'The Addams Family', 'Medieval Madness', 'Star Trek', 'Goonies'].map((t) => interludeOrder(t)[0]));
  assert.ok(firsts.size > 1);
});

test('les points ne disparaissent jamais, ouverture et intermèdes compris', () => {
  const wheel = wheelDetail(medallion())!;
  for (const input of [{ ...BTTF, wheel }, { title: 'Terminator 2', now: NOW }, undefined]) {
    const program = liveDmdProgram(input);
    const end = program.openingLength + program.cycle;
    for (let t = 0; t < end; t += 40) {
      const shot = program.at(t);
      // PRESS START clignote : sa demi-période éteinte est voulue.
      if (shot.page === 'press-start' && !shot.dots.some((v) => v > 0)) continue;
      assert.ok(shot.dots.some((v) => v > 0), `${input?.title ?? 'sans table'} : afficheur vide à ${t} ms (${shot.page})`);
    }
  }
});
