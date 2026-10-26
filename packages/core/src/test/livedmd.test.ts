// DMD du menu vivant (livedmd.ts, dmdfont.ts, app/src/live-dmd.ts) : la police dessinée, chaque
// page dans la grille de 128 × 32 avec ses marges, l'alternance et son rythme, la place des
// points sur l'écran du DMD, l'API des animations, et ce qui part vers la fenêtre.
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { DMD_FONT_HUGE, DMD_FONT_LARGE, DMD_FONT_SMALL, dmdText, scale2x, textWidth } from '../dmdfont';
import type { TableRecords } from '../highscores';
import {
  DMD_HEIGHT,
  DMD_LEVEL,
  DMD_MARGIN,
  DMD_WIDTH,
  LIVE_DMD_RECORDS,
  LIVE_DMD_TIMING,
  LiveDmdProgram,
  dmdAnimation,
  liveDmdArea,
  liveDmdPages,
  sameDots,
  scoreText,
  titlePage,
  transitionDots,
  type DmdDots,
} from '../livedmd';
import { REPO_ROOT } from './i18n-scan';

const NOW = () => new Date(2026, 9, 26, 18, 42, 10, 200);
const RECORDS: TableRecords = {
  file: 'x',
  storage: 'gotg_2020',
  credits: 14,
  scores: [1, 2, 3, 4, 5].map((rank) => ({ rank, score: 80_000_000 - rank * 10_000_000, initials: 'ABC' })),
};
const GALAXY = { title: 'Guardians of the Galaxy', manufacturer: 'Stern', year: 2017, records: RECORDS, hasMedia: true, now: NOW };

/** Colonnes allumées d'une image. */
function litColumns(dots: DmdDots): number[] {
  const cols = new Set<number>();
  dots.forEach((v, i) => v && cols.add(i % DMD_WIDTH));
  return [...cols].sort((a, b) => a - b);
}

test('police : chaque signe a 7 lignes de même largeur, les agrandissements doublent', () => {
  for (const [c, g] of DMD_FONT_SMALL.glyphs) {
    assert.equal(g.h, 7, `hauteur de « ${c} »`);
    assert.equal(g.px.length, g.w * g.h, `largeur de « ${c} »`);
  }
  assert.equal(DMD_FONT_LARGE.height, 14);
  assert.equal(DMD_FONT_HUGE.height, 28);
  assert.equal(DMD_FONT_LARGE.glyphs.get('A')!.w, 10);
  // Scale2x garde une diagonale en diagonale : pas d'escalier de 2 × 2.
  const diag = scale2x({ w: 2, h: 2, px: Uint8Array.from([1, 0, 0, 1]) });
  assert.deepEqual([...diag.px], [1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1]);
});

test('texte du DMD : capitales sans accent, signes inconnus en « ? »', () => {
  assert.equal(dmdText('Les Mystères  de l’Ouest'), "LES MYSTERES DE L'OUEST");
  assert.equal(dmdText('Ægir — Straße'), 'AEGIR - STRASSE');
  assert.equal(dmdText('Pokémon™'), 'POKEMON?');
});

test('chaque page tient dans la grille, ses textes fixes dans les marges', () => {
  for (const input of [GALAXY, { title: 'Terminator 2', manufacturer: 'Williams', year: 1991, now: NOW }, undefined]) {
    for (const page of liveDmdPages(input)) {
      if (page.media) continue;
      const dots = page.dots(0);
      assert.equal(dots.length, DMD_WIDTH * DMD_HEIGHT);
      assert.ok(dots.some((v) => v > 0), `page ${page.id} vide`);
      assert.ok(dots.every((v) => v >= 0 && v <= 15), `nuance hors de 0..15 (${page.id})`);
      const cols = litColumns(dots);
      if (!page.animated || page.id !== 'title') assert.ok(cols[0]! >= DMD_MARGIN && cols.at(-1)! < DMD_WIDTH - DMD_MARGIN, `${page.id} dans les marges : ${cols[0]} à ${cols.at(-1)}`);
    }
  }
});

test('titre : en grand s’il tient avec ses marges (Terminator 2), sinon il défile masqué par les marges', () => {
  const short = titlePage({ title: 'Terminator 2', manufacturer: 'Williams', year: 1991 });
  assert.ok(!short.animated, 'Terminator 2 tient sans défiler');
  const long = titlePage(GALAXY);
  assert.ok(long.animated);
  // Arrêt au début, défilement à vitesse fixe, arrêt à la fin : la durée suit la distance.
  const travel = textWidth(DMD_FONT_LARGE, dmdText(GALAXY.title)) - (DMD_WIDTH - 2 * DMD_MARGIN);
  assert.equal(long.hold, 2 * LIVE_DMD_TIMING.scrollPause + Math.round((travel / LIVE_DMD_TIMING.scroll) * 1000));
  assert.ok(sameDots(long.dots(0), long.dots(LIVE_DMD_TIMING.scrollPause - 10)), 'immobile au départ');
  assert.ok(!sameDots(long.dots(0), long.dots(LIVE_DMD_TIMING.scrollPause + 1000)), 'puis il glisse');
  for (const t of [0, 3000, long.hold]) {
    const cols = litColumns(long.dots(t));
    assert.ok(cols[0]! >= DMD_MARGIN && cols.at(-1)! < DMD_WIDTH - DMD_MARGIN, `marges masquées à ${t} ms`);
  }
});

test('alternance : titre, PRESS START, records (4 au plus), média, horloge, crédits ; les absents sautés', () => {
  const ids = liveDmdPages(GALAXY).map((p) => p.id);
  assert.deepEqual(ids, ['title', 'press-start', ...Array(LIVE_DMD_RECORDS).fill('records'), 'media', 'clock', 'credits']);
  assert.deepEqual(
    liveDmdPages({ title: 'Terminator 2' }).map((p) => p.id),
    ['title', 'press-start', 'clock', 'credits'],
  );
  assert.deepEqual(
    liveDmdPages(undefined).map((p) => p.id),
    ['brand', 'press-start', 'clock'],
  );
  // Un cycle d'environ 28 s pour une table à 4 records et un média (revue du directeur artistique).
  const cycle = new LiveDmdProgram(liveDmdPages({ ...GALAXY, title: 'Terminator 2' })).cycle;
  assert.ok(cycle > 26_000 && cycle < 30_000, `cycle de ${cycle} ms`);
});

test('records : le score et les initiales tels qu’enregistrés, crédits de la table sinon 0', () => {
  assert.equal(scoreText(75_000_000), '75․000․000');
  const pages = liveDmdPages(GALAXY);
  const credits = pages.find((p) => p.id === 'credits')!;
  const zero = liveDmdPages({ title: 'Terminator 2' }).find((p) => p.id === 'credits')!;
  assert.ok(!sameDots(credits.dots(0), zero.dots(0)), 'CREDITS 14 et CREDITS 0 diffèrent');
  // Nuances : le score au plus fort, le libellé un ton en dessous, l'horloge et les crédits plus calmes.
  const record = pages.find((p) => p.id === 'records')!.dots(0);
  assert.equal(Math.max(...record.subarray(0, 10 * DMD_WIDTH)), DMD_LEVEL.secondary);
  assert.equal(Math.max(...record.subarray(14 * DMD_WIDTH)), DMD_LEVEL.main);
  assert.equal(Math.max(...pages.find((p) => p.id === 'clock')!.dots(0)), DMD_LEVEL.quiet);
});

test('programme : poussée entre deux pages de points, pas entre deux records, coupe franche vers le média', () => {
  const program = new LiveDmdProgram(liveDmdPages(GALAXY));
  const pages = program.pages;
  const title = program.at(pages[0]!.hold + LIVE_DMD_TIMING.transition / 2);
  assert.ok(title.moving && !title.media, 'transition après le titre');
  const r1 = pages.findIndex((p) => p.id === 'records');
  assert.equal(program.startOf(r1 + 1), program.startOf(r1) + LIVE_DMD_TIMING.record, 'records remplacés sans mouvement');
  const media = pages.findIndex((p) => p.media);
  assert.equal(program.startOf(media), program.startOf(media - 1) + pages[media - 1]!.hold, 'pas de transition vers le média');
  const shot = program.at(program.startOf(media) + 100);
  assert.equal(shot.media, true);
  assert.equal(shot.dots, undefined);
  // Le cycle boucle.
  assert.equal(program.at(program.cycle + 10).page, 'title');
  // Poussée vers le haut : à mi-course, la moitié basse est le haut de la nouvelle image.
  const a = new Uint8Array(DMD_WIDTH * DMD_HEIGHT).fill(1);
  const b = new Uint8Array(DMD_WIDTH * DMD_HEIGHT).fill(2);
  const mid = transitionDots(a, b, 0.5);
  assert.equal(mid[0], 1);
  assert.equal(mid[DMD_WIDTH * DMD_HEIGHT - 1], 2);
});

test('place des points : dans le cadre du média FullDMD (retrait d’un point), sinon la bande 4:1 centrée', () => {
  const band = liveDmdArea(undefined, { width: 1920, height: 1080 });
  assert.ok(Math.abs(band.width - 1) < 1e-9);
  assert.ok(Math.abs((band.width * 1920) / (band.height * 1080) - 4) < 1e-6);
  assert.ok(Math.abs(band.y - (1 - band.height) / 2) < 1e-9);
  // DMD seul sur un écran 4:1 : toute la zone.
  const strip = liveDmdArea(undefined, { width: 1920, height: 480 });
  assert.deepEqual([strip.x, strip.y, strip.width, strip.height].map((v) => Math.round(v * 1000) / 1000), [0, 0, 1, 1]);
  const framed = liveDmdArea({ frame: { x: 0.05, y: 0.6, width: 0.9, height: 0.3 }, width: 1920, height: 1080 }, { width: 1920, height: 1080 });
  assert.ok(framed.x > 0.05 && framed.y > 0.6 && framed.x + framed.width < 0.95 && framed.y + framed.height < 0.9, 'dans le cadre, sans toucher sa bordure');
  // Média 16:9 dans une zone plus large : le cadre suit le média centré.
  const wide = liveDmdArea({ frame: { x: 0, y: 0.5, width: 1, height: 0.5 }, width: 1600, height: 900 }, { width: 2560, height: 1080 });
  assert.ok(wide.x > 0.1, 'média centré : le cadre ne part pas du bord de la zone');
});

test('animation « chargement » : le mot, une bille de 4 × 2 points qui roule sur un rail plus sombre', () => {
  const anim = dmdAnimation('chargement');
  assert.equal(anim.duration, undefined, 'en boucle jusqu’à ce qu’on l’arrête');
  const a = anim.dots(100);
  const b = anim.dots(700);
  assert.ok(!sameDots(a, b), 'la bille bouge');
  assert.ok(a.filter((v) => v === DMD_LEVEL.accent).length === 8, 'bille de 4 × 2 points');
  assert.ok(a.some((v) => v === DMD_LEVEL.rail));
  // Un texte trop long pour le grand passe en petit, sans déborder.
  const long = dmdAnimation('chargement', { label: 'Chargement de la table en cours' }).dots(0);
  const cols = litColumns(long);
  assert.ok(cols[0]! >= DMD_MARGIN && cols.at(-1)! < DMD_WIDTH - DMD_MARGIN);
});

interface Shot {
  media: boolean;
  dots?: DmdDots;
}
const { LiveDmd } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-dmd.js')) as {
  LiveDmd: new (o: { send(s: Shot): void; now?: () => number }) => {
    show(key: string, input: unknown): void;
    play(name: 'chargement', options?: { label?: string }): { stop(): void; done: Promise<void> };
    playing(): string | undefined;
    pause(): void;
    resume(): void;
    resend(): void;
    dispose(): void;
  };
};

test('LiveDmd : une image fixe part une fois, rien en pause, l’animation passe devant puis rend la main', async () => {
  let now = 0;
  const sent: Shot[] = [];
  const dmd = new LiveDmd({ now: () => now, send: (s) => sent.push(s) });
  dmd.show('t2', { title: 'Terminator 2', now: NOW });
  assert.equal(sent.length, 0, 'en pause au départ (pas d’écran du DMD, partie…)');
  dmd.resume();
  assert.equal(sent.length, 1);
  dmd.resend();
  assert.equal(sent.length, 2, 'renvoyée à une fenêtre rechargée');
  dmd.resume();
  assert.equal(sent.length, 2, 'même image : rien de plus');
  // La même table ne repart pas du titre ; une autre, si.
  now = 5500;
  dmd.show('t2', { title: 'Terminator 2', now: NOW });
  dmd.resend();
  const pressStart = sent.at(-1)!.dots!;
  dmd.show('autre', { title: 'Medieval Madness', now: NOW });
  assert.ok(!sameDots(sent.at(-1)!.dots, pressStart), 'nouvelle table : retour au titre');
  const anim = dmd.play('chargement');
  assert.equal(dmd.playing(), 'chargement');
  const loading = sent.at(-1)!.dots!;
  anim.stop();
  await anim.done;
  assert.equal(dmd.playing(), undefined);
  assert.ok(!sameDots(sent.at(-1)!.dots, loading), 'l’alternance reprend');
  dmd.pause();
  const count = sent.length;
  dmd.play('chargement');
  assert.equal(sent.length, count, 'rien n’est envoyé pendant la partie');
  dmd.dispose();
});
