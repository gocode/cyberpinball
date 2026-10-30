// Place de la bande d'une partie entre amis (essai réel du 30/10/2026 : en haut à gauche du plateau,
// elle « cache très souvent des endroits où on est censé voir la bille »). Elle quitte le plateau dès
// qu'un autre écran la porte : sur le DMD de temps à autre (points posés à sa place, le DMD de VPX
// ne s'écrivant pas de l'extérieur), en cartes sur un écran que VPX laisse libre (fronton sans
// .directb2s, topper), et seulement sans l'un ni l'autre en encart au bas du plateau, coin gauche
// pour le joueur. Vérifié sur les écrans simulés de docs\ecrans (borne, poste à deux écrans, un
// écran), dans les quatre sens du plateau, de un à quatre joueurs : rien hors de son écran, rien
// sur le DMD, jamais sur le plateau quand un autre écran peut la porter.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  LIVE_FLASH,
  LiveBoardFlash,
  gameNoticeBounds,
  liveBoardDots,
  liveBoardPlacement,
  liveCardsSize,
  type LiveBoardRow,
  type LiveBoardScreens,
  type LiveBoardView,
} from '../gamenotice';
import { indicatorBounds } from '../gamerecording';
import { DMD_HEIGHT, DMD_WIDTH } from '../livedmd';
import type { Rect, RoleId, Rotation } from '../model';
import { parseSimulatedDisplays } from '../offscreen';
import { splitBackglassDmd, zoneRect } from '../zones';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

const inside = (r: Rect, z: Rect) => r.x >= z.x && r.y >= z.y && r.x + r.width <= z.x + z.width && r.y + r.height <= z.y + z.height;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Les rôles des écrans simulés, comme docs\demo-medias.cjs (modele) les pose : indices dans le fichier, DMD en bande sous le fronton au poste. */
const LAYOUTS: Record<string, { roles: Partial<Record<RoleId, number>>; dmdUnderBackglass?: boolean }> = {
  borne: { roles: { playfield: 0, backglass: 1, dmd: 2, topper: 3 } },
  'poste-deux-ecrans': { roles: { playfield: 2, backglass: 0, dmd: 0 }, dmdUnderBackglass: true },
  'un-ecran': { roles: { playfield: 0 } },
};

function roleRects(name: string): Partial<Record<RoleId, Rect>> {
  const raw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'ecrans', `${name}.json`), 'utf8').replace(/^﻿/, ''));
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

test('écrans simulés : la bande quitte le plateau dès qu’un autre écran la porte, dans les quatre sens et pour un à quatre joueurs', () => {
  const seen = new Set<string>();
  for (const name of Object.keys(LAYOUTS)) {
    const rects = roleRects(name);
    // Ce que VPX occupe : rien (aucun .directb2s ni PuP), le fronton (cas courant), fronton et topper.
    for (const occupied of [[], ['backglass'], ['backglass', 'topper']] as RoleId[][]) {
      for (const rotation of ROTATIONS) {
        for (let rows = 1; rows <= 4; rows++) {
          const screens: LiveBoardScreens = {
            playfield: { zone: rects.playfield!, rotation },
            ...(rects.dmd ? { dmd: rects.dmd } : {}),
            free: (['backglass', 'topper'] as const).flatMap((role) => (rects[role] && !occupied.includes(role) ? [{ role, zone: rects[role]! }] : [])),
          };
          const placed = liveBoardPlacement(screens, rows);
          const where = `${name}, ${occupied.join('+') || 'rien'} occupé, ${rotation}°, ${rows} joueur(s)`;
          // Le DMD : les points à sa place, quand la borne en a un.
          assert.deepEqual(placed.dmd, rects.dmd, `${where} : DMD`);
          const band = placed.band;
          if (screens.free.length) {
            assert.ok(band && band.layout === 'cards' && band.role === screens.free[0]!.role, `${where} : cartes sur le premier écran libre`);
          } else if (rects.dmd) {
            assert.equal(band, undefined, `${where} : le DMD suffit, rien sur le plateau`);
          } else {
            assert.ok(band && band.role === 'playfield' && band.layout === 'insert', `${where} : encart du plateau`);
          }
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
  // Les trois formes ont servi : cartes du fronton, du topper, encart du plateau.
  assert.deepEqual([...seen].sort(), ['backglass/cards', 'playfield/insert', 'topper/cards']);
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

test('DMD : les scores de temps à autre, aux moments où le DMD ne dit rien d’essentiel', () => {
  const start = 1_000_000;
  const flash = new LiveBoardFlash(start);
  let v = view(2);
  const at = (ms: number) => flash.visible(v, start + ms);
  assert.equal(at(0), false, 'pas pendant le lancement de la table');
  assert.equal(at(LIVE_FLASH.firstMs), true, 'la liste des joueurs, peu après l’arrivée en partie');
  assert.equal(at(LIVE_FLASH.firstMs + LIVE_FLASH.showMs - 1), true);
  assert.equal(at(LIVE_FLASH.firstMs + LIVE_FLASH.showMs), false, `${LIVE_FLASH.showMs / 1000} s, puis le DMD de VPX revient`);
  // Ma bille change (le DMD compte le bonus) : de retour, mais jamais moins de 15 s après la dernière fois.
  v = { ...v, rows: v.rows.map((r) => (r.me ? { ...r, ball: 3, short: 'B3' } : r)) };
  assert.equal(at(LIVE_FLASH.firstMs + 10_000), false, 'trop tôt');
  assert.equal(at(LIVE_FLASH.firstMs + LIVE_FLASH.gapMs), true, 'ma bille a changé');
  const shownAt = LIVE_FLASH.firstMs + LIVE_FLASH.gapMs;
  // Rien ne change : au plus tard toutes les 45 s.
  assert.equal(at(shownAt + LIVE_FLASH.everyMs - 1), false);
  assert.equal(at(shownAt + LIVE_FLASH.everyMs), true);
  // Un autre prend la tête : de retour dès que l'écart le permet.
  const next = shownAt + LIVE_FLASH.everyMs;
  v = { ...v, rows: v.rows.map((r) => ({ ...r, lead: r.me })) };
  assert.equal(at(next + LIVE_FLASH.showMs + 1), false);
  assert.equal(at(next + LIVE_FLASH.gapMs), true, 'nouveau joueur en tête');
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
  assert.match(notice, /liveBoardPlacement\(screens, boardView\.rows\.length\)/);
  // Les points du DMD : une fenêtre le temps d'un passage, fermée ensuite, jamais cachée (screencover.test.ts).
  assert.match(notice, /const onDmd = placement\.dmd && flash\?\.visible\(boardView, Date\.now\(\)\) \? placement\.dmd : undefined;/);
  assert.match(notice, /dmd = layer\(dmd, onDmd, JSON\.stringify\(onDmd\)\);/);
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /return zone && !occupied\.has\(role\) \? \[\{ role, zone \}\] : \[\];/);
  assert.match(front, /const dmd = framed && screen \?/);
  // La page : les points du DMD par l'afficheur du menu (fallback.js), à sa couleur.
  const page = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'game-notice.html'), 'utf8');
  assert.match(page, /<script src="fallback\.js"><\/script>/);
  const script = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'game-notice.js'), 'utf8');
  assert.match(script, /CyberFallback\.dotMatrix\(/);
});
