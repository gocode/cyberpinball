// La souris sur le front-end (souris-roue.js, 21/11/2026). L'ouverture ne se passait qu'au clavier :
// un clic n'y faisait rien, faute d'élément cliquable à l'écran. Les flèches dessinées sur la roue
// n'étaient qu'une image, et la molette ne faisait rien. Invariants :
// - un clic dans le vide réveille tout écran qu'un bouton quelconque quitte (ouverture, attente,
//   nuit, préavis), jamais un écran éveillé ;
// - chaque flèche dessinée dans un bandeau de roue a sa zone cliquable, dans le bon sens, et
//   aucune zone n'existe sans flèche dessinée ;
// - la molette fait tourner la roue d'une table par cran, seulement sur l'écran des tables ;
// - le processus principal traite le réveil sans le confondre avec une autre action.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { APP, menuRenderer, menuState } from './menu-renderer';

const ROOT = path.join(APP, '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');

type Act = Record<string, unknown>;

function page(extra: Record<string, unknown> = {}) {
  const CyberIntro = { playfield: () => ({ destroy() {} }), backglass: () => ({ destroy() {} }), scenes: () => [], repaint() {} };
  const p = menuRenderer({ CyberIntro, ...extra });
  const acts: Act[] = [];
  // Copie : un objet né dans le contexte de la page n'a pas le prototype des objets de l'essai.
  (p.window.cyber as { act: (a: Act) => void }).act = (a) => acts.push(JSON.parse(JSON.stringify(a)) as Act);
  const fire = (target: { dispatchEvent(e: unknown): boolean }, type: string, props: Record<string, unknown> = {}) => {
    const event = new (p.document.defaultView as unknown as { Event: new (t: string, o: object) => object }).Event(type, { bubbles: true });
    Object.assign(event, props);
    target.dispatchEvent(event);
  };
  return { ...p, acts, fire };
}

const state = (layout = 'medaillons', extra: Record<string, unknown> = {}) => ({ ...menuState({ a: undefined, b: undefined, c: undefined }), menuLayout: layout, ...extra });

const introState = () => ({
  ...state(),
  phase: 'intro',
  intro: { id: 1, startedAt: undefined, screens: {}, hint: 'Appuyez sur un bouton' },
});

test('clic dans le vide : réveille l’ouverture, le mode attente, le voile de nuit et le préavis', () => {
  for (const [name, s] of [
    ['ouverture', introState()],
    ['attente', state('medaillons', { attract: { title: 'b' } })],
    ['nuit', state('medaillons', { night: 0.6 })],
    ['préavis', state('medaillons', { stop: { action: 'sleep', endsAt: Date.now() + 60_000 } })],
  ] as const) {
    const p = page();
    p.send(s);
    p.fire(p.document.body, 'click');
    assert.deepEqual(p.acts, [{ type: 'wake' }], name);
    // L'écran éveillé : la minuterie du préavis s'arrête, l'essai peut finir.
    p.send(state());
  }
});

test('clic dans le vide : rien sur l’écran des tables éveillé, ni en plus de l’action d’un élément cliquable', () => {
  const p = page();
  p.send(state());
  p.fire(p.document.body, 'click');
  assert.deepEqual(p.acts, [], 'écran éveillé : aucun réveil');
  const q = page();
  q.send(state('medaillons', { attract: { title: 'b' } }));
  // Un élément cliquable (la page en attente n'en montre aucun : posé par l'essai).
  const button = q.document.createElement('div');
  button.setAttribute('data-act', JSON.stringify({ type: 'collections', step: 1 }));
  q.document.body.append(button);
  q.fire(button, 'click');
  assert.deepEqual(q.acts.map((a) => a.type), ['collections'], 'l’élément cliqué envoie sa propre action, qui réveille déjà');
});

/** Chevrons dessinés dans le bandeau source : « M x1,y1 L x2,y2 L x1,y3 », pointe en x2. */
function drawnArrows(style: string) {
  const svg = read('docs', 'design-system', 'src', 'roues', `${style}.svg`);
  const found = new Map<string, { dir: number; x0: number; x1: number; y0: number; y1: number }>();
  for (const m of svg.matchAll(/d="M (\d+),(\d+) L (\d+),(\d+) L (\d+),(\d+)"/g)) {
    const [x1, y1, x2, , x3, y3] = m.slice(1).map(Number) as [number, number, number, number, number, number];
    if (x1 !== x3 || x1 === x2) continue;
    found.set(m[0], { dir: x2 < x1 ? -1 : 1, x0: Math.min(x1, x2), x1: Math.max(x1, x2), y0: y1, y1: y3 });
  }
  return [...found.values()];
}

test('flèches : chaque flèche dessinée d’un bandeau a sa zone cliquable, dans son sens ; aucune zone sans flèche', () => {
  for (const style of ['medaillons', 'bandeau', 'minimal', 'arche']) {
    const p = page();
    p.send(state(style));
    const stage = p.document.querySelector('.wheel-stage');
    assert.ok(stage, `${style} : roue rendue`);
    const zones = [...stage!.children]
      .filter((c) => c.classList.contains('wheel-arrow'))
      .map((z) => {
        const n = (prop: string) => Number(/calc\((\d+) \* var\(--w\)\)/.exec((z as unknown as { style: Record<string, string> }).style[prop] ?? '')?.[1]);
        return { dir: (JSON.parse(z.getAttribute('data-act')!) as { offset: number }).offset, x: n('left'), y: n('top'), w: n('width'), h: n('height') };
      });
    const arrows = drawnArrows(style);
    assert.equal(zones.length, arrows.length, `${style} : ${arrows.length} flèche(s) dessinée(s), ${zones.length} zone(s)`);
    for (const a of arrows) {
      // Le trait (6 unités au plus) déborde de 3 de chaque côté du tracé.
      const hit = zones.find((z) => z.dir === a.dir && z.x <= a.x0 - 3 && z.x + z.w >= a.x1 + 3 && z.y <= a.y0 - 3 && z.y + z.h >= a.y1 + 3);
      assert.ok(hit, `${style} : flèche ${a.dir < 0 ? 'gauche' : 'droite'} en ${a.x0},${a.y0} sans zone qui la couvre`);
    }
    for (const z of zones) assert.ok(z.x >= 0 && z.y >= 0 && z.x + z.w <= 1080 && z.y + z.h <= 540, `${style} : zone hors du bandeau`);
  }
});

test('flèches : un clic fait tourner la roue d’une table ; changer de roue retire les zones de l’ancienne', () => {
  const p = page();
  p.send(state('medaillons'));
  const zones = [...p.document.querySelectorAll('.wheel-arrow')];
  p.fire(zones.find((z) => z.classList.contains('previous'))!, 'click');
  p.fire(zones.find((z) => z.classList.contains('next'))!, 'click');
  assert.deepEqual(p.acts, [{ type: 'wheel', offset: -1 }, { type: 'wheel', offset: 1 }]);
  p.send(state('arche'));
  assert.equal(p.document.querySelectorAll('.wheel-arrow').length, 0);
});

test('molette : un cran, une table, dans le sens du geste ; rien hors de l’écran des tables', async () => {
  const p = page();
  p.send(state());
  const inside = p.document.querySelector('.wheel-stage')!;
  p.fire(inside, 'wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 });
  await new Promise((r) => setTimeout(r, 90));
  p.fire(inside, 'wheel', { deltaY: -100, deltaX: 0, deltaMode: 0 });
  assert.deepEqual(p.acts, [{ type: 'wheel', offset: 1 }, { type: 'wheel', offset: -1 }]);
  const q = page();
  q.send({ ...state(), phase: 'library' });
  q.fire(q.document.body, 'wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 });
  assert.deepEqual(q.acts, [], 'hors de l’écran des tables, la molette fait défiler la page, pas la roue');
  // Sur un écran qui dort, la molette le réveille, sans tourner la roue.
  const r = page();
  r.send(state('medaillons', { attract: { title: 'b' } }));
  r.fire(r.document.body, 'wheel',{ deltaY: 100, deltaX: 0, deltaMode: 0 });
  assert.deepEqual(r.acts, [{ type: 'wake' }]);
});

test('molette : un pavé tactile cumule ses petits pas jusqu’à un cran, une rafale ne fait pas dérouler la roue', () => {
  const p = page();
  const step = (p.window as unknown as { CyberSouris: { wheelStepper(): (e: object, now: number) => number } }).CyberSouris.wheelStepper();
  const px = (deltaY: number, deltaX = 0) => ({ deltaY, deltaX, deltaMode: 0 });
  // Pavé tactile : 8 pas de 7 points, à 10 ms d'écart : un seul pas de roue, quand le cumul atteint un cran.
  const pad = [0, 10, 20, 30, 40, 50, 60, 70].map((t) => step(px(7), 1000 + t));
  assert.deepEqual(pad.filter(Boolean), [1]);
  // Rafale de crans à 20 ms : une table toutes les 70 ms au plus.
  const burst = [0, 20, 40, 60, 80, 100, 120, 140].map((t) => step(px(100), 5000 + t)).filter(Boolean);
  assert.ok(burst.length >= 2 && burst.length <= 3, `${burst.length} tables en 140 ms`);
  // Changement de sens : le cumul repart de zéro ; geste horizontal pris en compte.
  assert.equal(step(px(-30), 9000), 0);
  assert.equal(step(px(40), 9010), 0, 'le cumul vers le haut ne compte pas vers le bas');
  assert.equal(step(px(0, -120), 9500), -1, 'vers la gauche : la table précédente');
  // Molette en lignes (deltaMode 1) : 3 lignes font un cran.
  assert.equal(step({ deltaY: 3, deltaX: 0, deltaMode: 1 }, 12_000), 1);
});

test('processus principal : le réveil d’un clic dans le vide ne va à aucun autre écran', () => {
  const main = read('app', 'src', 'frontend.ts');
  const start = main.indexOf("ipcMain.on('action'");
  const handler = main.slice(start, main.indexOf('\n  });', start));
  const intro = handler.indexOf("if (state.phase === 'intro') return void leaveIntro();");
  const wake = handler.indexOf("if (action.type === 'wake') return;");
  const attract = handler.indexOf('attract.activity()');
  assert.ok(attract > 0 && intro > attract && wake > intro, 'attente, puis ouverture, puis le réveil arrêté là');
  assert.ok(wake < handler.indexOf("action.type === 'key'"), 'avant toute autre action');
});
