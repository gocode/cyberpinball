// Place de la bande d'une partie entre amis (essai réel du 30/10/2026 : en haut à gauche du plateau,
// elle « cache très souvent des endroits où on est censé voir la bille »). Elle quitte le plateau dès
// qu'un autre écran la porte : sur le DMD de temps à autre (points posés à sa place, le DMD de VPX
// ne s'écrivant pas de l'extérieur), en cartes sur un écran que VPX laisse libre (fronton sans
// .directb2s, topper), et seulement sans l'un ni l'autre en encart au bas du plateau, coin gauche
// pour le joueur. Vérifié sur les écrans simulés de packages\core\ecrans-simules (borne, poste à deux écrans, un
// écran), dans les quatre sens du plateau, de un à quatre joueurs : rien hors de son écran, rien
// sur le DMD, jamais sur le plateau quand un autre écran peut la porter.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  LIVE_CARDS_SIZE,
  LIVE_FLASH,
  LIVE_SCORES_PLACES,
  LIVE_DMD_OVERDUE_MS,
  LiveBoardFlash,
  LiveDmdTally,
  gameNoticeBounds,
  liveBoardDots,
  liveBoardPlacement,
  liveCardsSize,
  liveScoresChoices,
  liveScoresDmdUnavailable,
  overlayCoveredBy,
  parseLiveScoresSettings,
  type LiveBoardRow,
  type LiveBoardScreens,
  type LiveBoardView,
} from '../gamenotice';
import type { StackedWindow } from '../screencover';
import { indicatorBounds } from '../gamerecording';
import { DMD_HEIGHT, DMD_WIDTH } from '../livedmd';
import type { Rect, RoleId, Rotation } from '../model';
import { parseSimulatedDisplays } from '../offscreen';
import { splitBackglassDmd, zoneRect } from '../zones';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

const inside = (r: Rect, z: Rect) => r.x >= z.x && r.y >= z.y && r.x + r.width <= z.x + z.width && r.y + r.height <= z.y + z.height;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Les rôles des écrans simulés, comme interne\demos\demo-medias.cjs (modele) les pose : indices dans le fichier, DMD en bande sous le fronton au poste. */
const LAYOUTS: Record<string, { roles: Partial<Record<RoleId, number>>; dmdUnderBackglass?: boolean }> = {
  borne: { roles: { playfield: 0, backglass: 1, dmd: 2, topper: 3 } },
  'poste-deux-ecrans': { roles: { playfield: 2, backglass: 0, dmd: 0 }, dmdUnderBackglass: true },
  'un-ecran': { roles: { playfield: 0 } },
  // Le PinCab de l'essai du 02/11/2026 : plateau 4K couché, fronton, FullDMD 16:9, sans topper.
  pincab: { roles: { playfield: 0, backglass: 1, dmd: 2 } },
};

function roleRects(name: string): Partial<Record<RoleId, Rect>> {
  const raw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'core', 'ecrans-simules', `${name}.json`), 'utf8').replace(/^﻿/, ''));
  const displays = parseSimulatedDisplays(raw, name);
  const layout = LAYOUTS[name]!;
  const rects: Partial<Record<RoleId, Rect>> = {};
  for (const [role, i] of Object.entries(layout.roles) as [RoleId, number][]) rects[role] = { ...displays[i]!.bounds };
  if (layout.dmdUnderBackglass) {
    const b = rects.backglass!;
    const split = splitBackglassDmd({ width: b.width, height: b.height });
    for (const role of ['backglass', 'dmd'] as const) {
      const r = zoneRect(split[role], b);
      rects[role] = { x: b.x + r.x, y: b.y + r.y, width: r.width, height: r.height };
    }
  }
  return rects;
}

function row(name: string, over: Partial<LiveBoardRow> = {}): LiveBoardRow {
  return { name, score: '1 240 500', points: 1_240_500, detail: 'Bille 2 sur 3', short: 'B2', ball: 2, done: false, me: false, lead: false, ...over };
}

function view(n: number): LiveBoardView {
  const names = ['Bruno', 'Alexis', 'Chloé', 'Dora'];
  return { mode: 'board', title: 'Partie entre amis', rows: names.slice(0, n).map((name, i) => row(name, { me: i === 1, lead: i === 0, points: 2_418_300 - i * 600_000 })) };
}

/** Le bas pour le joueur, dans le repère de l'écran : le bord des flippers. */
function playerBottom(rotation: Rotation): 'bottom' | 'left' | 'top' | 'right' {
  return ({ 0: 'bottom', 90: 'left', 180: 'top', 270: 'right' } as const)[rotation];
}

test('écrans simulés : le fronton, même pris par la table, sinon le topper, sinon le bas du plateau, dans les quatre sens et pour un à quatre joueurs', () => {
  const seen = new Set<string>();
  for (const name of Object.keys(LAYOUTS)) {
    const rects = roleRects(name);
    // Ce que VPX occupe : rien (aucun .directb2s ni PuP), le fronton (cas courant), fronton et topper.
    for (const occupied of [[], ['backglass'], ['backglass', 'topper']] as RoleId[][]) {
      for (const rotation of ROTATIONS) {
        for (let rows = 1; rows <= 4; rows++) {
        for (const dmdReadable of [true, false]) {
          const screens: LiveBoardScreens = {
            playfield: { zone: rects.playfield!, rotation },
            ...(rects.dmd ? { dmd: rects.dmd } : {}),
            dmdReadable,
            free: (['backglass', 'topper'] as const).flatMap((role) => (rects[role] && !occupied.includes(role) ? [{ role, zone: rects[role]! }] : [])),
            zones: { ...(rects.backglass ? { backglass: rects.backglass } : {}), ...(rects.topper ? { topper: rects.topper } : {}) },
          };
          const placed = liveBoardPlacement(screens, rows);
          const where = `${name}, ${occupied.join('+') || 'rien'} occupé, ${rotation}°, ${rows} joueur(s), DMD ${dmdReadable ? 'lisible' : 'illisible'}`;
          // Le DMD : les points à sa place, quand la borne en a un et qu'il se lit (inspector de VPX).
          assert.deepEqual(placed.dmd, dmdReadable ? rects.dmd : undefined, `${where} : DMD`);
          const band = placed.band;
          // Le fronton, même pris par la table (essai du 04/11/2026) ; sinon le topper ; le plateau en dernier recours.
          const expected = rects.backglass ? 'backglass' : rects.topper ? 'topper' : 'playfield';
          assert.ok(band && band.role === expected && band.layout === (expected === 'playfield' ? 'insert' : 'cards'), `${where} : ${expected}`);
          if (!band) continue;
          seen.add(`${band.role}/${band.layout}`);
          const screen = rects[band.role]!;
          assert.ok(inside(band.bounds, screen), `${where} : bande dans son écran (${JSON.stringify(band.bounds)} dans ${JSON.stringify(screen)})`);
          if (rects.dmd) assert.ok(!overlap(band.bounds, rects.dmd), `${where} : la bande ne couvre pas le DMD`);
          if (band.layout === 'cards') {
            // Une carte par joueur à la même échelle en largeur et en hauteur, d'au moins la moitié de sa taille.
            const base = liveCardsSize(rows);
            const scale = band.bounds.width / base.width;
            assert.ok(scale >= 0.5 - 1e-9, `${where} : cartes lisibles (${scale.toFixed(2)})`);
            assert.ok(Math.abs(band.bounds.height / base.height - scale) < 0.02, `${where} : cartes non déformées`);
            assert.equal(band.rotation, 0);
            continue;
          }
          // L'encart : au bord des flippers et dans le tiers gauche du joueur, loin du milieu (l'écoulement)
          // et du couloir de lancement ; jamais sur le témoin d'un enregistrement (coin haut-droit).
          const z = screen;
          const b = band.bounds;
          const short = Math.min(z.width, z.height);
          const quarter = rotation === 90 || rotation === 270;
          // Hauteur et largeur du plateau vu du joueur, et la part de l'encart dans chacune.
          const tall = quarter ? z.width : z.height;
          const wide = quarter ? z.height : z.width;
          const along = (quarter ? b.width : b.height) / tall;
          const across = (quarter ? b.height : b.width) / wide;
          const gap = { bottom: z.y + z.height - (b.y + b.height), top: b.y - z.y, left: b.x - z.x, right: z.x + z.width - (b.x + b.width) }[playerBottom(rotation)];
          assert.ok(gap <= Math.ceil((14 * short) / 1080), `${where} : encart au bord des flippers (${gap} px)`);
          if (tall >= wide) {
            // Borne : la table remplit l'écran ; l'encart reste sur le tablier, sous la sortie des couloirs extérieurs.
            assert.ok(along <= 0.1, `${where} : au plus un dixième de la hauteur du plateau (${(along * 100).toFixed(1)} %)`);
            assert.ok(across <= 0.36, `${where} : dans le tiers gauche (${(across * 100).toFixed(1)} %)`);
          } else {
            // Bureau : la table est au milieu de l'écran en paysage ; l'encart reste à côté.
            assert.ok(across <= 0.2, `${where} : à côté de la table (${(across * 100).toFixed(1)} %)`);
          }
          assert.equal(band.rotation, rotation);
          const witness = indicatorBounds(z, rotation, { width: Math.round((420 * short) / 1080), height: Math.round((72 * short) / 1080) }, Math.round((28 * short) / 1080));
          assert.ok(!overlap(b, witness), `${where} : jamais sur le témoin d’enregistrement`);
        }
        }
      }
    }
  }
  // Ces bornes ont toutes un fronton quand elles ont un topper : cartes du fronton, encart du plateau
  // (le topper seul : plateau + topper, dans le test suivant).
  // (L'invariant sur toutes les combinaisons d'écrans : le test suivant.)
  assert.deepEqual([...seen].sort(), ['backglass/cards', 'playfield/insert']);
});

test('invariant : l’automatique, et tout choix impossible, donnent toujours une bande visible, sur toute combinaison d’écrans', () => {
  // Les combinaisons d'écrans d'une borne : plateau seul, plateau + fronton, plateau + DMD, plateau +
  // fronton + DMD (le PinCab), + topper (la borne type), plateau + topper, DMD sous le fronton (le poste).
  const pincab = roleRects('pincab');
  const borne = roleRects('borne');
  const combos: [string, Partial<Record<RoleId, Rect>>][] = [
    ['plateau seul', roleRects('un-ecran')],
    ['plateau + fronton', { playfield: pincab.playfield!, backglass: pincab.backglass! }],
    ['plateau + DMD', { playfield: pincab.playfield!, dmd: pincab.dmd! }],
    ['plateau + fronton + DMD (PinCab)', pincab],
    ['plateau + fronton + DMD + topper', borne],
    ['plateau + topper', { playfield: borne.playfield!, topper: borne.topper! }],
    ['DMD sous le fronton (poste)', roleRects('poste-deux-ecrans')],
    // Un fronton peu haut : la bande discrète y restait illisible et partait sur le plateau (banc du 04/11/2026).
    ['petit fronton 1280 × 516', { playfield: pincab.playfield!, backglass: { x: 3840, y: 0, width: 1280, height: 516 } }],
  ];
  const subsets = <T,>(xs: T[]): T[][] => xs.reduce<T[][]>((all, x) => [...all, ...all.map((a) => [...a, x])], [[]]);
  let cases = 0;
  for (const [name, rects] of combos) {
    // Ce que la table prend : tous les sous-ensembles des écrans de la borne autres que le plateau (B2S, PuP, DMD de VPX).
    for (const taken of subsets((['backglass', 'topper', 'dmd'] as const).filter((r) => rects[r]))) {
      for (const dmdReadable of [true, false]) {
        for (const rotation of ROTATIONS) {
          for (let rows = 1; rows <= 4; rows++) {
            const screens: LiveBoardScreens = {
              playfield: { zone: rects.playfield!, rotation },
              ...(rects.dmd ? { dmd: rects.dmd } : {}),
              dmdReadable,
              free: (['backglass', 'topper'] as const).flatMap((role) => (rects[role] && !taken.includes(role) ? [{ role, zone: rects[role]! }] : [])),
              zones: { ...(rects.backglass ? { backglass: rects.backglass } : {}), ...(rects.topper ? { topper: rects.topper } : {}) },
            };
            for (const place of LIVE_SCORES_PLACES) {
              for (const dmdOn of [true, false]) {
                const p = liveBoardPlacement(screens, rows, place, dmdOn);
                const where = `${name}, pris : ${taken.join('+') || 'rien'}, DMD ${dmdReadable ? 'lisible' : 'illisible'} ${dmdOn ? 'activé' : 'désactivé'}, ${rotation}°, ${rows} joueur(s), ${place}`;
                cases++;
                assert.ok(p.why, `${where} : le journal dit pourquoi`);
                // Toujours une bande visible, dans son écran, jamais sur le DMD.
                const band = p.band;
                assert.ok(band, `${where} : une bande visible`);
                const screen = rects[band.role]!;
                assert.ok(band.bounds.width > 0 && band.bounds.height > 0 && inside(band.bounds, screen), `${where} : dans son écran`);
                if (rects.dmd) assert.ok(!overlap(band.bounds, rects.dmd), `${where} : pas sur le DMD`);
                // L'automatique (et le repli d'un choix impossible) : le fronton, même pris ; sinon le topper ; sinon le plateau.
                if (place === 'auto' || p.fallback) {
                  const expected = rects.backglass ? 'backglass' : rects.topper ? 'topper' : 'playfield';
                  assert.equal(band.role, expected, `${where} : ${expected}`);
                }
                // Sur le fronton, discrète : au plus un cinquième de sa hauteur, ou la plus petite taille lisible.
                if (band.role === 'backglass') assert.ok(band.bounds.height <= Math.max(rects.backglass!.height * 0.2, LIVE_CARDS_SIZE.min * LIVE_CARDS_SIZE.height) + 1, `${where} : discrète (${band.bounds.height} px)`);
                // Le DMD : un réglage à part, quelle que soit la place ; seulement s'il se lit.
                assert.deepEqual(p.dmd, dmdOn && dmdReadable ? rects.dmd : undefined, `${where} : DMD`);
                // Un choix impossible : l'automatique, et la raison au journal.
                const possible = place === 'auto' || place === 'playfield-bottom' || place === 'playfield-side' || Boolean(rects[place]);
                assert.equal(Boolean(p.fallback), !possible, `${where} : repli ${possible ? 'inutile' : 'attendu'}`);
              }
            }
          }
        }
      }
    }
  }
  assert.ok(cases > 5000, `${cases} cas`);
  // Le PinCab (essai du 04/11/2026), fronton pris par le B2S, FullDMD lu : la bande sur le fronton, devant le B2S, et le DMD en plus.
  const pin = liveBoardPlacement({ playfield: { zone: pincab.playfield!, rotation: 90 }, dmd: pincab.dmd!, dmdReadable: true, free: [], zones: { backglass: pincab.backglass! } }, 2);
  assert.equal(pin.band?.role, 'backglass');
  assert.deepEqual(pin.dmd, pincab.dmd);
  assert.match(pin.why!, /automatique : fronton \(pris par la table, la bande passe devant\), et sur le DMD/);
});

test('encart : le coin bas-gauche du joueur, quel que soit le sens du plateau', () => {
  const zone = { x: 100, y: 50, width: 1920, height: 1080 };
  const size = { width: 300, height: 100 };
  // Le coin bas-gauche du joueur, dans le repère de l'écran, à 10 px des deux bords.
  const expect = { 0: ['left', 'bottom'], 90: ['left', 'top'], 180: ['right', 'top'], 270: ['right', 'bottom'] } as const;
  for (const rotation of ROTATIONS) {
    const r = gameNoticeBounds(zone, rotation, size, 10, 'bottom-left');
    const [h, v] = expect[rotation];
    const corner = { x: h === 'left' ? r.x - zone.x : zone.x + zone.width - (r.x + r.width), y: v === 'top' ? r.y - zone.y : zone.y + zone.height - (r.y + r.height) };
    assert.deepEqual(corner, { x: 10, y: 10 }, `${rotation}°`);
  }
});

test('DMD : les scores seulement sur l’écran de score, jamais au hasard', () => {
  const start = 1_000_000;
  const flash = new LiveBoardFlash(start);
  let v = view(2);
  let scoreScreen = false;
  const at = (ms: number) => flash.visible(v, start + ms, scoreScreen);
  // Pas d'écran de score (lancement, animation) : rien, quel que soit le temps passé.
  assert.equal(at(0), false);
  assert.equal(at(60_000), false, 'jamais sans l’écran de score');
  // Le premier repos de la partie, vu depuis settleMs : la liste des joueurs.
  scoreScreen = true;
  assert.equal(at(60_000), false, 'écran de score à peine vu');
  const first = 60_000 + LIVE_FLASH.settleMs;
  assert.equal(at(first), true, 'premier écran de score : la liste des joueurs');
  assert.equal(at(first + 3000), true);
  // Le DMD montre autre chose (une animation, le score qui bouge) : les points partent tout de suite.
  scoreScreen = false;
  assert.equal(at(first + 3001), false, 'animation : les points partent');
  scoreScreen = true;
  assert.equal(at(first + 3500), false, 'le passage est fini, rien de nouveau');
  // Ma bille change : de retour au prochain écran de score, jamais moins de 15 s après la dernière fois.
  v = { ...v, rows: v.rows.map((r) => (r.me ? { ...r, ball: 3, short: 'B3' } : r)) };
  assert.equal(at(first + 4000), false, 'écran de score revu, trop tôt');
  assert.equal(at(first + LIVE_FLASH.gapMs - 1), false, 'trop tôt');
  assert.equal(at(first + LIVE_FLASH.gapMs), true, 'ma bille a changé');
  const shownAt = first + LIVE_FLASH.gapMs;
  assert.equal(at(shownAt + LIVE_FLASH.showMs - 1), true);
  assert.equal(at(shownAt + LIVE_FLASH.showMs), false, `${LIVE_FLASH.showMs / 1000} s au plus`);
  // Rien ne change : toutes les 12 s, pourvu que le DMD montre l'écran de score (« toutes les 10 à 15 s », essai du 04/11/2026).
  assert.ok(LIVE_FLASH.everyMs >= 10_000 && LIVE_FLASH.everyMs <= 15_000 && LIVE_FLASH.gapMs >= 10_000 && LIVE_FLASH.showMs < LIVE_FLASH.gapMs);
  assert.equal(at(shownAt + LIVE_FLASH.everyMs - 1), false);
  assert.equal(at(shownAt + LIVE_FLASH.everyMs), true);
  // Un autre prend la tête : de retour dès que l'écart le permet.
  const next = shownAt + LIVE_FLASH.everyMs;
  v = { ...v, rows: v.rows.map((r) => ({ ...r, lead: r.me })) };
  assert.equal(at(next + LIVE_FLASH.showMs + 1), false);
  assert.equal(at(next + LIVE_FLASH.gapMs), true, 'nouveau joueur en tête');
});

// Essai du 04/11/2026 sur le PinCab : « Scores sur le DMD » activé, rien de toute la partie, et rien au
// journal pour dire pourquoi. Invariant : réglage activé et DMD présent, au moins un passage au bout de
// LIVE_DMD_OVERDUE_MS de partie, sinon une ligne du journal qui dit pourquoi ; à la fin, toujours un bilan.
test('garde-fou des scores sur le DMD : un passage, ou la raison au journal', () => {
  const verdicts: Record<string, (t: number) => { scoreScreen: boolean; why: string }> = {
    'écran de score': () => ({ scoreScreen: true, why: 'écran de score' }),
    'jamais calme': () => ({ scoreScreen: false, why: 'animation' }),
    'animations entre deux': (t) => (t % 18_000 < 14_000 ? { scoreScreen: true, why: 'écran de score' } : { scoreScreen: false, why: 'animation' }),
    'écran de score par instants': (t) => (t % 5000 < 400 ? { scoreScreen: true, why: 'écran de score' } : { scoreScreen: false, why: 'autre écran (animation, texte, choix à faire)' }),
  };
  let cases = 0;
  for (const wanted of [true, false])
    for (const screen of [true, false])
      for (const readable of [true, false])
        for (const [name, verdict] of Object.entries(verdicts)) {
          const start = 1_000_000;
          const tally = new LiveDmdTally(start);
          const flash = new LiveBoardFlash(start);
          const lines: string[] = [];
          let firstPass: number | undefined;
          const placed = wanted && screen && readable;
          for (let t = 0; t <= 90_000; t += 500) {
            const v = readable ? verdict(t) : undefined;
            const shown = placed && flash.visible(view(2), start + t, v?.scoreScreen ?? false);
            if (shown) firstPass ??= t;
            const line = tally.tick(start + t, { wanted, screen, readable, ...(readable ? {} : { unreadable: 'inspector de VPX injoignable sur le port 2113' }), ...(v ? { verdict: v } : {}), shown });
            if (line) lines.push(line);
          }
          const label = `${name}, réglage ${wanted}, écran ${screen}, lisible ${readable}`;
          const summary = tally.summary(start + 90_000);
          assert.ok(/^Scores sur le DMD : /.test(summary) && /pourquoi : .+|le reste du temps : .+/.test(summary), `${label} : ${summary}`);
          if (wanted && screen) {
            // Au moins un passage avant le délai, ou la ligne du garde-fou, une seule fois, avec sa raison.
            if (firstPass !== undefined && firstPass < LIVE_DMD_OVERDUE_MS) assert.deepEqual(lines, [], label);
            else {
              assert.equal(lines.length, 1, `${label} : ${lines.join(' | ')}`);
              assert.match(lines[0]!, /aucun passage après \d+ s de partie ; pourquoi : \S/, label);
            }
          } else assert.deepEqual(lines, [], `${label} : pas de garde-fou sans le réglage ou sans DMD`);
          if (!wanted) assert.match(summary, /désactivé/, label);
          else if (!screen) assert.match(summary, /pas d’écran du DMD/, label);
          else if (!readable) assert.match(summary, /DMD illisible \(inspector de VPX injoignable/, label);
          cases++;
        }
  assert.equal(cases, 32);
  // Un DMD qui montre son écran de score : un passage toutes les 12 s, au bilan.
  const tally = new LiveDmdTally(0);
  const flash = new LiveBoardFlash(0);
  for (let t = 0; t <= 120_000; t += 500) tally.tick(t, { wanted: true, screen: true, readable: true, verdict: { scoreScreen: true, why: 'écran de score' }, shown: flash.visible(view(2), t, true) });
  assert.ok(tally.count >= 9, `${tally.count} passages en 120 s`);
  assert.match(tally.summary(120_000), /^Scores sur le DMD : \d+ passages en 120 s de partie \(un toutes les 1[0-3] s\)/);
});

test('choix du joueur : chaque place, et l’automatique quand la borne ou la table ne la permet pas', () => {
  const rects = roleRects('borne');
  for (const rotation of ROTATIONS) {
    const screens: LiveBoardScreens = { playfield: { zone: rects.playfield!, rotation }, dmd: rects.dmd!, dmdReadable: true, free: [], zones: { backglass: rects.backglass!, topper: rects.topper! } };
    // Fronton et topper choisis : la bande s'y pose même quand la table s'en sert (B2S, PuP).
    for (const role of ['backglass', 'topper'] as const) {
      const p = liveBoardPlacement(screens, 3, role);
      assert.equal(p.band?.role, role);
      // Les scores sur le DMD : leur propre réglage, en plus de la place choisie.
      assert.deepEqual(p.dmd, rects.dmd);
      assert.equal(liveBoardPlacement(screens, 3, role, false).dmd, undefined, 'DMD désactivé');
      assert.ok(inside(p.band!.bounds, rects[role]!));
    }
    // Bas et côté du plateau : l'encart, au bord des flippers ou au milieu du bord gauche du joueur.
    const bottom = liveBoardPlacement(screens, 3, 'playfield-bottom').band!;
    const side = liveBoardPlacement(screens, 3, 'playfield-side').band!;
    for (const b of [bottom, side]) assert.ok(b.role === 'playfield' && b.layout === 'insert' && inside(b.bounds, rects.playfield!));
    const quarter = rotation === 90 || rotation === 270;
    const z = rects.playfield!;
    const middle = quarter ? side.bounds.x + side.bounds.width / 2 - (z.x + z.width / 2) : side.bounds.y + side.bounds.height / 2 - (z.y + z.height / 2);
    assert.ok(Math.abs(middle) <= 1, `${rotation}° : à mi-hauteur du joueur (${middle})`);
  }
  // Ce que la table ne permet pas : l'automatique, et la raison au journal.
  const screens: LiveBoardScreens = { playfield: { zone: rects.playfield!, rotation: 0 }, dmd: rects.dmd!, dmdReadable: false, free: [], zones: { topper: rects.topper! } };
  const noBackglass = liveBoardPlacement(screens, 2, 'backglass');
  assert.equal(noBackglass.band?.role, 'topper', 'pas de fronton : le topper');
  assert.match(noBackglass.fallback!, /pas de fronton/);
  // Les réglages, lus sans confiance : l'ancien choix « Sur le DMD » devient l'automatique, DMD activé ; un réglage par table l'emporte.
  assert.deepEqual(parseLiveScoresSettings({ place: 'dmd' }), { place: 'auto', dmd: true });
  assert.deepEqual(parseLiveScoresSettings({ place: 'topper', dmd: false }), { place: 'topper', dmd: false });
  assert.deepEqual(parseLiveScoresSettings({ place: 'plafond' }), { place: 'auto', dmd: true });
  assert.deepEqual(parseLiveScoresSettings(null), { place: 'auto', dmd: true });
  const perTable = { place: 'backglass', dmd: true, tables: { t2: { dmd: false } } };
  assert.deepEqual(parseLiveScoresSettings(perTable, 't2'), { place: 'backglass', dmd: false });
  assert.deepEqual(parseLiveScoresSettings(perTable, 'autre'), { place: 'backglass', dmd: true });
});

test('réglages : chaque choix visible, grisé avec sa raison quand la borne ne le permet pas ; le DMD à part', () => {
  const all = liveScoresChoices({ backglass: true, topper: true, dmd: true, inspector: true });
  assert.deepEqual(all.map((c) => c.place), [...LIVE_SCORES_PLACES]);
  assert.ok(all.every((c) => !c.unavailable));
  const poor = liveScoresChoices({ backglass: false, topper: false, dmd: true, inspector: false });
  assert.deepEqual(poor.map((c) => c.place), [...LIVE_SCORES_PLACES], 'jamais caché');
  const why = Object.fromEntries(poor.map((c) => [c.place, c.unavailable]));
  assert.match(why.backglass!, /Pas d’écran de fronton/);
  assert.match(why.topper!, /Pas de topper/);
  assert.equal(why.auto, undefined);
  assert.equal(why['playfield-bottom'], undefined);
  // « Scores sur le DMD » : son propre réglage, grisé avec sa raison.
  assert.equal(liveScoresDmdUnavailable({ backglass: true, topper: true, dmd: true, inspector: true }), undefined);
  assert.match(liveScoresDmdUnavailable({ backglass: true, topper: true, dmd: true, inspector: false })!, /inspector de VPX/);
  assert.match(liveScoresDmdUnavailable({ backglass: true, topper: true, dmd: false, inspector: true })!, /DMD matériel/);
});

test('recouvrement : la fenêtre d’un autre processus passée devant la bande est trouvée', () => {
  const win = (handle: number, pid: number, rect: StackedWindow['rect'], extra: Partial<StackedWindow> = {}): StackedWindow => ({ handle: BigInt(handle), pid, className: 'X', title: `w${handle}`, rect, minimized: false, ...extra });
  const band = win(10, 1, { x: 100, y: 100, width: 400, height: 100 });
  const stack = [
    win(1, 50, { x: 0, y: 1040, width: 1920, height: 40 }, { className: 'Shell_TrayWnd' }),
    win(2, 60, { x: 600, y: 0, width: 200, height: 200 }),
    win(3, 70, { x: 0, y: 0, width: 1920, height: 1080 }, { minimized: true }),
    win(4, 80, { x: 50, y: 50, width: 1920, height: 1080 }, { title: 'PUPSCREEN2', className: 'PuPScreen', topmost: true }),
    band,
    win(5, 90, { x: 0, y: 0, width: 1920, height: 1080 }),
  ];
  assert.equal(overlayCoveredBy(stack, 10n, 1)?.title, 'PUPSCREEN2', 'le PuP devant, pas la barre des tâches ni une fenêtre réduite ou à côté');
  assert.equal(overlayCoveredBy(stack.slice(4), 10n, 1), undefined, 'rien devant');
  assert.equal(overlayCoveredBy([win(7, 1, band.rect), band], 10n, 1), undefined, 'une fenêtre de Cyber Pinball ne compte pas');
});

test('DMD : une ligne par joueur dans les 128 × 32 points, le nom raccourci plutôt que le score', () => {
  for (let n = 1; n <= 4; n++) {
    const v = view(n);
    v.rows[0]!.name = 'Maximilien-Alexandre';
    v.rows[0]!.points = 1_234_567_890;
    const dots = liveBoardDots(v);
    assert.equal(dots.length, DMD_WIDTH * DMD_HEIGHT);
    const lit = (y: number) => [...dots.subarray(y * DMD_WIDTH, (y + 1) * DMD_WIDTH)].some((d) => d > 0);
    // Des lignes de texte séparées par au moins une ligne éteinte : le titre (jusqu'à trois joueurs) et un joueur par ligne.
    let bands = 0;
    for (let y = 0; y < DMD_HEIGHT; y++) if (lit(y) && (y === 0 || !lit(y - 1))) bands++;
    assert.equal(bands, n + (n < 4 ? 1 : 0), `${n} joueur(s) : lignes du DMD`);
    // Les bords restent éteints (marge de 3 points), et chaque ligne garde un trou entre le nom et le score.
    for (let y = 0; y < DMD_HEIGHT; y++) for (const x of [0, 1, 2, DMD_WIDTH - 3, DMD_WIDTH - 2, DMD_WIDTH - 1]) assert.equal(dots[y * DMD_WIDTH + x], 0, `${n} : bord (${x}, ${y})`);
  }
});

test('application : les fenêtres de la bande et du DMD, et ce que frontend.ts leur donne', () => {
  const notice = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'game-notice.ts'), 'utf8');
  // Une seule façon de créer une fenêtre par-dessus VPX : transparente, sans focus, hors des captures.
  assert.equal(notice.match(/createWindow\(\{/g)?.length, 1);
  assert.match(notice, /liveBoardPlacement\(screens, boardView\.rows\.length, place, settings\.dmd\)/);
  // Les points du DMD : seulement sur l'écran de score ; une fenêtre le temps d'un passage, fermée ensuite, jamais cachée (screencover.test.ts).
  assert.match(notice, /const onDmd = placement\.dmd && flash\?\.visible\(boardView, now, verdict\?\.scoreScreen \?\? false\) \? placement\.dmd : undefined;/);
  // Garde-fou (essai du 04/11/2026) : chaque relecture comptée, la ligne du garde-fou et le bilan de la partie au journal.
  assert.match(notice, /const overdue = tally\.tick\(now, \{ wanted: settings\.dmd, screen: Boolean\(screens\?\.dmd\), readable: Boolean\(screens\?\.dmdReadable\)/);
  assert.match(notice, /if \(overdue\) opts\.log\?\.\(overdue\);/);
  assert.match(notice, /function close\(\): void \{[\s\S]*?if \(tally\) opts\.log\?\.\(tally\.summary\(Date\.now\(\)\)\);/);
  // Au-dessus de toute fenêtre de VPX, PuP, B2S : remise devant, et le journal le dit.
  assert.match(notice, /keepInFront\(band, 'bande'\);/);
  // Ses fenêtres se ferment par close(), jamais par destroy() : détruite pendant qu'une autre charge, elle emporte leur processus de rendu.
  assert.doesNotMatch(notice, /\.destroy\(\)/);
  assert.match(notice, /function dispose\(o: Overlay \| undefined\): void \{\s+if \(o\?\.guard\) clearInterval\(o\.guard\);\s+if \(alive\(o\)\) o\.win\.close\(\);/);
  // Plus de bande : elle seule part ; l'attente du départ commun et la nouvelle restent (démonstration du 04/11/2026).
  assert.match(notice, /if \(!view\) \{[^}]*if \(boardView\) closeBoard\(\);/);
  // Pendant l'attente du départ commun, sa carte seule sur le plateau : pas de bande par-dessus.
  assert.match(notice, /if \(waitView\) \{\s+band = layer\(band, undefined, ''\);\s+dmd = layer\(dmd, undefined, ''\);/);
  assert.match(notice, /keepInFront\(dmd, 'dmd'\);/);
  assert.match(notice, /recouverte par \$\{by\} : remise devant/);
  assert.match(notice, /dmd = layer\(dmd, onDmd, JSON\.stringify\(onDmd\)\);/);
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  // Un écran pris par VPX pendant la partie le reste pour la bande (elle sautait sur le fronton rendu à la fermeture).
  assert.match(front, /return zone && !occupiedThisGame\.has\(role\) \? \[\{ role, zone \}\] : \[\];/);
  assert.match(front, /for \(const role of next\) occupiedThisGame\.add\(role\);/);
  // Le DMD lu par l'inspector quand le joueur y veut les scores, et les signaux du relevé.
  assert.match(front, /dmdWatch\?\.game\(\{ inGame: Boolean\(st\?\.inGame\)/);
  assert.match(front, /dmdVerdict: \(\) => dmdWatch\?\.verdict\(\),/);
  // Une table sans PinMAME : jamais l'inspector sur son DMD, le rythme de la partie (arrêt de VPX du 04/11/2026).
  assert.match(front, /double\.dmdByScript && double\.live \? scriptDmdWatch\(\) : double\.inspectorPort \? watchVpxDmd\(/);
  assert.match(front, /dmdUnreadable: \(\) => \(dmdWatch \? dmdWatch\.unreadable\(\) : /);
  assert.match(front, /const dmd = framed && screen \?/);
  // La page : les points du DMD par l'afficheur du menu (fallback.js), à sa couleur.
  const page = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'game-notice.html'), 'utf8');
  assert.match(page, /<script src="fallback\.js"><\/script>/);
  const script = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'game-notice.js'), 'utf8');
  assert.match(script, /CyberFallback\.dotMatrix\(/);
});
