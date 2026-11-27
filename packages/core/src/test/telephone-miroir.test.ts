// Miroir du navigateur sur le téléphone (remote-mirror.ts, app/src/phone-mirror.ts) : ce qui doit
// rester vrai quelle que soit la borne. La conversion d'un point de l'image en pixel du bureau
// (fenêtre à coordonnées négatives, écran en portrait), une seule image en vol, aucune capture sans
// demande du téléphone, aucun port de débogage dans Edge, et le pavé tactile inchangé. Tout se joue
// avec de fausses captures et une fausse horloge : aucune fenêtre, aucun Edge.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as vm from 'node:vm';
import { appBrowserArgs } from '../applications';
import {
  MIRROR_BOX_MAX,
  MIRROR_ZOOM_STEPS_MAX,
  MIRROR_EDGE_MAX,
  MIRROR_EDGE_MIN,
  MIRROR_LEVELS,
  MIRROR_RISE_AFTER,
  mirrorAdapt,
  mirrorFit,
  mirrorPoint,
  mirrorWheel,
  parseMirrorMessage,
  type MirrorRect,
} from '../remote-mirror';
import { parsePhoneMessage } from '../remote';
import { REPO_ROOT } from './i18n-scan';

const APP_DIST = path.resolve(__dirname, '../../../../app/dist');

// ---------------------------------------------------------------------------
// Conversion image → pixel du bureau

test('mirrorPoint : un point de l\'image tombe dans la fenêtre, jamais sur son bord extérieur', () => {
  const rect: MirrorRect = { x: 100, y: 50, width: 800, height: 600 };
  assert.deepEqual(mirrorPoint(rect, 0, 0), { x: 100, y: 50 });
  assert.deepEqual(mirrorPoint(rect, 1, 1), { x: 899, y: 649 });
  assert.deepEqual(mirrorPoint(rect, 0.5, 0.5), { x: 500, y: 350 });
  // Hors de l'image (téléphone mal lu) : ramené sur le bord, jamais hors de la fenêtre.
  assert.deepEqual(mirrorPoint(rect, -3, 9), { x: 100, y: 649 });
  assert.deepEqual(mirrorPoint(rect, Number.NaN, Number.NaN), { x: 100, y: 50 });
});

test('mirrorPoint : fenêtre sur un écran à gauche ou au-dessus (coordonnées négatives)', () => {
  const rect: MirrorRect = { x: -1920, y: -200, width: 1920, height: 1080 };
  assert.deepEqual(mirrorPoint(rect, 0, 0), { x: -1920, y: -200 });
  assert.deepEqual(mirrorPoint(rect, 1, 1), { x: -1, y: 879 });
  assert.deepEqual(mirrorPoint(rect, 0.25, 0.5), { x: -1440, y: 340 });
});

test('mirrorPoint : écran tourné en portrait par Windows (1080 × 1920)', () => {
  const rect: MirrorRect = { x: 3840, y: 0, width: 1080, height: 1920 };
  assert.deepEqual(mirrorPoint(rect, 0, 0), { x: 3840, y: 0 });
  assert.deepEqual(mirrorPoint(rect, 1, 1), { x: 3840 + 1079, y: 1919 });
  assert.deepEqual(mirrorPoint(rect, 0.5, 0.25), { x: 3840 + 540, y: 480 });
  // Un portrait n'est pas un paysage tourné : x suit la largeur, y la hauteur.
  const land = mirrorPoint({ x: 0, y: 0, width: 1920, height: 1080 }, 0.5, 0.25);
  assert.deepEqual(land, { x: 960, y: 270 });
});

test('mirrorPoint : rectangle dégénéré (fenêtre réduite) sans division ni sortie', () => {
  assert.deepEqual(mirrorPoint({ x: 10, y: 20, width: 0, height: 0 }, 0.9, 0.9), { x: 10, y: 20 });
});

// ---------------------------------------------------------------------------
// Taille de l'image

test('mirrorFit : la fenêtre entre dans la place du téléphone, sans déformation ni agrandissement', () => {
  // Fenêtre paysage sur un téléphone en portrait : la largeur du téléphone limite.
  const a = mirrorFit({ width: 1920, height: 1080 }, { w: 390, h: 700 });
  assert.equal(a.width, 390);
  assert.ok(Math.abs(a.width / a.height - 1920 / 1080) < 0.02);
  // Fenêtre portrait sur un téléphone en portrait.
  const b = mirrorFit({ width: 1080, height: 1920 }, { w: 390, h: 700 });
  assert.ok(b.width <= 390 && b.height <= 700);
  assert.ok(Math.abs(b.width / b.height - 1080 / 1920) < 0.02);
  // Jamais plus grande que la fenêtre.
  const c = mirrorFit({ width: 300, height: 200 }, { w: 2000, h: 2000 });
  assert.deepEqual(c, { width: 300, height: 200 });
});

test('mirrorFit : bornes du côté long et du côté court, et réduction par niveau', () => {
  const big = mirrorFit({ width: 7680, height: 4320 }, { w: 4000, h: 4000 });
  assert.ok(Math.max(big.width, big.height) <= MIRROR_EDGE_MAX);
  const tiny = mirrorFit({ width: 1920, height: 1080 }, { w: 40, h: 40 });
  assert.ok(Math.min(tiny.width, tiny.height) >= MIRROR_EDGE_MIN - 1);
  const full = mirrorFit({ width: 1920, height: 1080 }, { w: 900, h: 900 }, 1);
  const light = mirrorFit({ width: 1920, height: 1080 }, { w: 900, h: 900 }, MIRROR_LEVELS[3]!.scale);
  assert.ok(light.width < full.width);
});

// ---------------------------------------------------------------------------
// Adaptation à la liaison

test('mirrorAdapt : une liaison lente allège, une liaison rapide et stable remonte, jamais hors des niveaux', () => {
  let pace = { level: 0, fast: 0 };
  for (let i = 0; i < 10; i++) pace = mirrorAdapt(pace, 900);
  assert.equal(pace.level, MIRROR_LEVELS.length - 1);
  // Remonte d'un niveau après MIRROR_RISE_AFTER accusés rapides de suite, pas avant.
  for (let i = 0; i < MIRROR_RISE_AFTER - 1; i++) pace = mirrorAdapt(pace, 40);
  assert.equal(pace.level, MIRROR_LEVELS.length - 1);
  pace = mirrorAdapt(pace, 40);
  assert.equal(pace.level, MIRROR_LEVELS.length - 2);
  // Un accusé moyen remet le compte à zéro.
  pace = mirrorAdapt(pace, 300);
  assert.equal(pace.fast, 0);
  for (let i = 0; i < 100; i++) pace = mirrorAdapt(pace, 10);
  assert.equal(pace.level, 0);
});

test('mirrorAdapt : de 4 à 8 images par seconde', () => {
  assert.equal(mirrorAdapt({ level: 0, fast: 0 }, 50).intervalMs, 125);
  assert.equal(mirrorAdapt({ level: 0, fast: 0 }, 300).intervalMs, 250);
  assert.equal(mirrorAdapt({ level: 2, fast: 0 }, 50).intervalMs, 250);
});

test('mirrorWheel : la page suit le doigt, en pixels de la fenêtre', () => {
  assert.deepEqual(mirrorWheel({ width: 1000, height: 800 }, 0, 0.25), { deltaX: 0, deltaY: 200 });
  assert.deepEqual(mirrorWheel({ width: 1000, height: 800 }, -0.1, -0.5), { deltaX: -100, deltaY: -400 });
});

// ---------------------------------------------------------------------------
// Messages du téléphone

test('les messages du miroir passent par le parseur de la télécommande, bornes comprises', () => {
  assert.deepEqual(parsePhoneMessage({ t: 'mirror', s: 1, on: true, w: 390, h: 700 }), { t: 'mirror', s: 1, on: true, w: 390, h: 700 });
  assert.deepEqual(parsePhoneMessage({ t: 'mirror', s: 2, on: false }), { t: 'mirror', s: 2, on: false, w: 1, h: 1 });
  assert.equal(parsePhoneMessage({ t: 'mirror', s: 3, on: true }), undefined);
  assert.equal(parsePhoneMessage({ t: 'mirror', s: 3, on: true, w: 0, h: 10 }), undefined);
  assert.equal(parsePhoneMessage({ t: 'mirror', s: 3, on: true, w: MIRROR_BOX_MAX + 1, h: 10 }), undefined);
  assert.equal(parsePhoneMessage({ t: 'mirror', s: 3, on: 'oui', w: 10, h: 10 }), undefined);
  assert.deepEqual(parsePhoneMessage({ t: 'mirror-ack', s: 4, n: 7 }), { t: 'mirror-ack', s: 4, n: 7 });
  assert.equal(parsePhoneMessage({ t: 'mirror-ack', s: 4, n: 0 }), undefined);
  assert.equal(parsePhoneMessage({ t: 'mirror-ack', s: 4, n: 1.5 }), undefined);
  assert.deepEqual(parsePhoneMessage({ t: 'tap', s: 5, fx: 0.5, fy: 1, button: 'right', count: 1 }), { t: 'tap', s: 5, fx: 0.5, fy: 1, button: 'right', count: 1 });
  assert.equal(parsePhoneMessage({ t: 'tap', s: 5, fx: 1.2, fy: 0.5, button: 'left' }), undefined);
  assert.equal(parsePhoneMessage({ t: 'tap', s: 5, fx: 0.5, fy: -0.1, button: 'left' }), undefined);
  assert.equal(parsePhoneMessage({ t: 'tap', s: 5, fx: 0.5, fy: 0.5, button: 'middle' }), undefined);
  assert.deepEqual(parsePhoneMessage({ t: 'mscroll', s: 6, fx: 0.2, fy: 0.3, dx: 0, dy: -0.4 }), { t: 'mscroll', s: 6, fx: 0.2, fy: 0.3, dx: 0, dy: -0.4 });
  assert.equal(parsePhoneMessage({ t: 'mscroll', s: 6, fx: 0.2, fy: 0.3, dx: 0, dy: 50 }), undefined);
  assert.equal(parsePhoneMessage({ t: 'mscroll', s: 6, fx: 0.2, fy: 0.3, dx: 'a', dy: 0 }), undefined);
  assert.equal(parseMirrorMessage({ t: 'move' }, 1), undefined);
});

test('un pincement « mzoom » : un nombre entier de pas non nul, au plus MIRROR_ZOOM_STEPS_MAX', () => {
  assert.deepEqual(parsePhoneMessage({ t: 'mzoom', s: 7, steps: 1 }), { t: 'mzoom', s: 7, steps: 1 });
  assert.deepEqual(parsePhoneMessage({ t: 'mzoom', s: 7, steps: -MIRROR_ZOOM_STEPS_MAX }), { t: 'mzoom', s: 7, steps: -MIRROR_ZOOM_STEPS_MAX });
  assert.equal(parsePhoneMessage({ t: 'mzoom', s: 7, steps: 0 }), undefined);
  assert.equal(parsePhoneMessage({ t: 'mzoom', s: 7, steps: MIRROR_ZOOM_STEPS_MAX + 1 }), undefined);
  assert.equal(parsePhoneMessage({ t: 'mzoom', s: 7, steps: 1.5 }), undefined);
  assert.equal(parsePhoneMessage({ t: 'mzoom', s: 7, steps: '2' }), undefined);
  assert.equal(parsePhoneMessage({ t: 'mzoom', s: 7 }), undefined);
});

test('le pavé tactile garde son vocabulaire : move, click et scroll se lisent comme avant', () => {
  assert.deepEqual(parsePhoneMessage({ t: 'move', s: 1, dx: 3, dy: -4, ms: 16 }), { t: 'move', s: 1, dx: 3, dy: -4, ms: 16 });
  assert.deepEqual(parsePhoneMessage({ t: 'click', s: 2, button: 'left', count: 2 }), { t: 'click', s: 2, button: 'left', count: 2 });
  assert.deepEqual(parsePhoneMessage({ t: 'scroll', s: 3, dx: 0, dy: 12 }), { t: 'scroll', s: 3, dx: 0, dy: 12 });
});

// ---------------------------------------------------------------------------
// Le contrôleur de la borne, avec une fausse horloge et une fausse capture

interface MirrorShot {
  jpeg: Buffer;
  width: number;
  height: number;
}
interface FakeHost {
  live(): boolean;
  rect(): MirrorRect | undefined;
  capture(size: { width: number; height: number }, quality: number): Promise<MirrorShot | undefined>;
  send(m: Record<string, unknown>): void;
  pointer(x: number, y: number): void;
  click(b: 'left' | 'right', c: number): void;
  wheel(dx: number, dy: number): void;
  zoom(dir: 1 | -1): void;
  log(line: string): void;
  touch?(phase: 'down' | 'move' | 'up', x: number, y: number): boolean;
  now(): number;
  after(ms: number, fn: () => void): () => void;
}
interface Mirror {
  request(on: boolean, box: { w: number; h: number }): void;
  ack(n: number): void;
  tap(m: { t: 'tap'; s: number; fx: number; fy: number; button: 'left' | 'right'; count: 1 | 2 }): void;
  scroll(m: { t: 'mscroll'; s: number; fx: number; fy: number; dx: number; dy: number; end?: true }): void;
  zoom(m: { t: 'mzoom'; s: number; steps: number }): void;
  readonly active: boolean;
  stop(): void;
}

function rig(opts: { rect?: MirrorRect; live?: boolean; touch?: 'ok' | 'refused' } = {}) {
  let t = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const state = {
    live: opts.live ?? true,
    rect: (opts.rect ?? { x: -1920, y: 0, width: 1920, height: 1080 }) as MirrorRect | undefined,
    shot: true,
    captures: [] as { width: number; height: number; quality: number }[],
    sent: [] as Record<string, unknown>[],
    pointer: [] as [number, number][],
    clicks: [] as [string, number][],
    wheels: [] as [number, number][],
    zooms: [] as number[],
    touches: [] as [string, number, number][],
    logs: [] as string[],
    pending: undefined as undefined | ((s: MirrorShot | undefined) => void),
    manual: false,
  };
  const host: FakeHost = {
    live: () => state.live,
    rect: () => state.rect,
    capture: (size, quality) => {
      state.captures.push({ ...size, quality });
      if (state.manual) return new Promise((r) => (state.pending = r));
      return Promise.resolve(state.shot ? { jpeg: Buffer.from('jpeg'), width: size.width, height: size.height } : undefined);
    },
    send: (m) => void state.sent.push(m),
    pointer: (x, y) => void state.pointer.push([x, y]),
    click: (b, c) => void state.clicks.push([b, c]),
    wheel: (dx, dy) => void state.wheels.push([dx, dy]),
    zoom: (dir) => void state.zooms.push(dir),
    log: (line) => void state.logs.push(line),
    ...(opts.touch ? { touch: (phase: string, x: number, y: number) => (state.touches.push([phase, x, y]), opts.touch === 'ok') } : {}),
    now: () => t,
    after: (ms, fn) => {
      const id = nextId++;
      timers.set(id, { at: t + ms, fn });
      return () => void timers.delete(id);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPhoneMirror } = require(path.join(APP_DIST, 'phone-mirror.js')) as { createPhoneMirror: (h: FakeHost) => Mirror };
  const mirror = createPhoneMirror(host);
  const settle = async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
  };
  /** Fait avancer l'horloge, en lançant les minuteries dans l'ordre. */
  async function advance(ms: number): Promise<void> {
    const end = t + ms;
    for (;;) {
      await settle();
      const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      t = Math.max(t, due[1].at);
      due[1].fn();
    }
    t = end;
    await settle();
  }
  const frames = () => state.sent.filter((m) => m.t === 'frame');
  return { mirror, state, advance, settle, frames, timers };
}

test('aucune capture tant que le téléphone n\'a pas demandé le miroir', async () => {
  const r = rig();
  await r.advance(5000);
  assert.equal(r.state.captures.length, 0);
  assert.equal(r.mirror.active, false);
  // Une demande d'arrêt sans demande avant ne déclenche rien non plus.
  r.mirror.request(false, { w: 1, h: 1 });
  await r.advance(1000);
  assert.equal(r.state.captures.length, 0);
});

test('aucune capture quand la télécommande ne pilote pas la fenêtre, reprise dès qu\'elle la pilote', async () => {
  const r = rig({ live: false });
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(3000);
  assert.equal(r.state.captures.length, 0);
  assert.equal(r.frames().length, 0);
  r.state.live = true;
  await r.advance(1000);
  assert.equal(r.frames().length, 1);
});

test('une seule image en vol : la suivante attend l\'accusé du téléphone', async () => {
  const r = rig();
  r.mirror.request(true, { w: 390, h: 700 });
  // Moins que le délai d'abandon (8 s) : sans accusé, la borne n'envoie rien d'autre.
  await r.advance(5000);
  assert.equal(r.state.captures.length, 1, 'sans accusé, une seule capture');
  assert.equal(r.frames().length, 1);
  const first = r.frames()[0]!;
  assert.equal(first.n, 1);
  assert.equal(typeof first.d, 'string');
  assert.equal(Buffer.from(first.d as string, 'base64').toString(), 'jpeg');
  // Un accusé d'une autre image est ignoré.
  r.mirror.ack(99);
  await r.advance(1000);
  assert.equal(r.frames().length, 1);
  r.mirror.ack(1);
  await r.advance(300);
  assert.equal(r.frames().length, 2);
  assert.equal(r.frames()[1]!.n, 2);
  // Un accusé répété pour une image déjà acquittée ne relance rien.
  r.mirror.ack(1);
  await r.advance(1000);
  assert.equal(r.frames().length, 2);
});

test('la capture est lancée au plus 8 fois par seconde, même si le téléphone répond tout de suite', async () => {
  const r = rig();
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  for (let i = 1; i <= 40; i++) {
    r.mirror.ack(i);
    await r.advance(10);
  }
  // 400 ms écoulées : au plus 8 × 0,4 + 1 captures.
  assert.ok(r.state.captures.length <= 5, `captures : ${r.state.captures.length}`);
});

test('la taille de l\'image suit la place du téléphone et la fenêtre, jamais un agrandissement', async () => {
  const r = rig({ rect: { x: 0, y: 0, width: 1080, height: 1920 } });
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  const c = r.state.captures[0]!;
  assert.ok(c.width <= 390 && c.height <= 700);
  assert.ok(Math.abs(c.width / c.height - 1080 / 1920) < 0.02);
  assert.equal(c.quality, MIRROR_LEVELS[0]!.quality);
});

test('liaison lente : l\'image s\'allège ; liaison rapide : elle revient', async () => {
  const r = rig();
  r.mirror.request(true, { w: 800, h: 800 });
  await r.advance(0);
  const first = r.state.captures[0]!;
  // Accusés tardifs.
  for (let i = 1; i <= 3; i++) {
    await r.advance(900);
    r.mirror.ack(i);
    await r.advance(300);
  }
  const slow = r.state.captures[r.state.captures.length - 1]!;
  assert.ok(slow.width < first.width && slow.quality < first.quality, `${first.width}/${first.quality} → ${slow.width}/${slow.quality}`);
});

test('image sans accusé : abandonnée après le délai, la suivante part', async () => {
  const r = rig();
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  assert.equal(r.frames().length, 1);
  await r.advance(9000);
  assert.ok(r.frames().length >= 2);
});

test('le retour au pavé arrête tout : plus de capture, plus d\'image attendue, appuis ignorés', async () => {
  const r = rig();
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  r.mirror.request(false, { w: 1, h: 1 });
  assert.equal(r.mirror.active, false);
  assert.equal(r.timers.size, 0, 'plus de minuterie');
  r.mirror.ack(1);
  await r.advance(5000);
  assert.equal(r.state.captures.length, 1);
  assert.equal(r.frames().length, 1);
  r.mirror.tap({ t: 'tap', s: 1, fx: 0.5, fy: 0.5, button: 'left', count: 1 });
  r.mirror.scroll({ t: 'mscroll', s: 2, fx: 0.5, fy: 0.5, dx: 0, dy: 0.3 });
  assert.deepEqual(r.state.pointer, []);
  assert.deepEqual(r.state.clicks, []);
  assert.deepEqual(r.state.wheels, []);
});

test('arrêt pendant une capture : l\'image en cours ne part pas, et une nouvelle demande repart proprement', async () => {
  const r = rig();
  r.state.manual = true;
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  assert.equal(r.state.captures.length, 1);
  r.mirror.stop();
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(500);
  assert.equal(r.state.captures.length, 1, 'une seule capture à la fois, même après un arrêt');
  r.state.pending!({ jpeg: Buffer.from('vieille'), width: 10, height: 10 });
  r.state.manual = false;
  await r.advance(500);
  assert.equal(r.frames().filter((f) => Buffer.from(f.d as string, 'base64').toString() === 'vieille').length, 0, 'l\'image d\'avant l\'arrêt n\'est jamais envoyée');
  assert.equal(r.frames().length, 1);
});

test('capture en échec : le téléphone est prévenu après plusieurs échecs, et reprend sans rien faire quand elle revient', async () => {
  const r = rig();
  r.state.shot = false;
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(10_000);
  const states = r.state.sent.filter((m) => m.t === 'mirror-state');
  assert.deepEqual(states, [{ t: 'mirror-state', ok: false }]);
  r.state.shot = true;
  await r.advance(2000);
  assert.equal(r.frames().length, 1);
  assert.deepEqual(r.state.sent.filter((m) => m.t === 'mirror-state').pop(), { t: 'mirror-state', ok: true });
});

test('fenêtre disparue : rien n\'est capturé, rien ne plante', async () => {
  const r = rig();
  r.state.rect = undefined;
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(3000);
  assert.equal(r.state.captures.length, 0);
});

test('un appui sur l\'image devient un clic à la bonne place, fenêtre à coordonnées négatives', async () => {
  const r = rig({ rect: { x: -1920, y: -100, width: 1920, height: 1080 } });
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  r.mirror.tap({ t: 'tap', s: 1, fx: 0.5, fy: 0.5, button: 'left', count: 1 });
  r.mirror.tap({ t: 'tap', s: 2, fx: 1, fy: 1, button: 'right', count: 1 });
  assert.deepEqual(r.state.pointer, [[-960, 440], [-1, 979]]);
  assert.deepEqual(r.state.clicks, [['left', 1], ['right', 1]]);
});

test('un glissement devient un coup de molette à l\'endroit du doigt', async () => {
  const r = rig({ rect: { x: 0, y: 0, width: 1000, height: 800 } });
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  r.mirror.scroll({ t: 'mscroll', s: 1, fx: 0.5, fy: 0.5, dx: 0, dy: 0.25 });
  assert.deepEqual(r.state.pointer, [[500, 400]]);
  assert.deepEqual(r.state.wheels, [[0, 200]]);
  // Un glissement nul n'envoie rien.
  r.mirror.scroll({ t: 'mscroll', s: 2, fx: 0.5, fy: 0.5, dx: 0, dy: 0 });
  assert.equal(r.state.wheels.length, 1);
});

test('un pincement zoome la page d\'autant de pas, dans le bon sens, et rien hors miroir actif', async () => {
  const r = rig();
  // Miroir non demandé : rien.
  r.mirror.zoom({ t: 'mzoom', s: 1, steps: 2 });
  assert.deepEqual(r.state.zooms, []);
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  r.mirror.zoom({ t: 'mzoom', s: 2, steps: 2 });
  r.mirror.zoom({ t: 'mzoom', s: 3, steps: -1 });
  assert.deepEqual(r.state.zooms, [1, 1, -1]);
  // Au plus MIRROR_ZOOM_STEPS_MAX pas par message, même si le message en demande plus.
  r.state.zooms.length = 0;
  r.mirror.zoom({ t: 'mzoom', s: 4, steps: 99 });
  assert.equal(r.state.zooms.length, MIRROR_ZOOM_STEPS_MAX);
  // La télécommande ne pilote plus la fenêtre, ou la fenêtre a disparu : rien.
  r.state.zooms.length = 0;
  r.state.live = false;
  r.mirror.zoom({ t: 'mzoom', s: 5, steps: 1 });
  r.state.live = true;
  r.state.rect = undefined;
  r.mirror.zoom({ t: 'mzoom', s: 6, steps: 1 });
  assert.deepEqual(r.state.zooms, []);
});

test('site au rendu mobile : le glissement est un vrai doigt (pose, déplacements, levée), jamais la molette', async () => {
  const r = rig({ rect: { x: 100, y: 50, width: 1000, height: 800 }, touch: 'ok' });
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  // Glissement vers le haut (TikTok : la vidéo suivante) commencé au milieu de l'image.
  r.mirror.scroll({ t: 'mscroll', s: 1, fx: 0.5, fy: 0.8, dx: 0, dy: -0.1 });
  r.mirror.scroll({ t: 'mscroll', s: 2, fx: 0.5, fy: 0.8, dx: 0, dy: -0.3 });
  r.mirror.scroll({ t: 'mscroll', s: 3, fx: 0.5, fy: 0.8, dx: 0, dy: 0, end: true });
  assert.deepEqual(r.state.touches, [['down', 600, 690], ['move', 600, 610], ['move', 600, 370], ['up', 600, 370]]);
  assert.deepEqual(r.state.wheels, [], 'pas de molette en plus du doigt');
  assert.deepEqual(r.state.pointer, [], 'le pointeur de la souris ne bouge pas');
  // Un autre glissement repart d'un nouveau doigt, et ne sort pas de la fenêtre.
  r.state.touches.length = 0;
  r.mirror.scroll({ t: 'mscroll', s: 4, fx: 0.9, fy: 0.1, dx: 0.5, dy: -0.5 });
  r.mirror.scroll({ t: 'mscroll', s: 5, fx: 0.9, fy: 0.1, dx: 0, dy: 0, end: true });
  assert.deepEqual(r.state.touches, [['down', 1000, 130], ['move', 1099, 50], ['up', 1099, 50]]);
});

test('glissement tactile : un doigt resté posé est levé après un silence, et à l\'arrêt du miroir', async () => {
  const r = rig({ rect: { x: 0, y: 0, width: 1000, height: 800 }, touch: 'ok' });
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  r.mirror.scroll({ t: 'mscroll', s: 1, fx: 0.5, fy: 0.5, dx: 0, dy: -0.1 });
  await r.advance(1600);
  assert.deepEqual(r.state.touches.map((x) => x[0]), ['down', 'move', 'up'], 'levé après le silence');
  r.state.touches.length = 0;
  r.mirror.scroll({ t: 'mscroll', s: 2, fx: 0.5, fy: 0.5, dx: 0, dy: -0.1 });
  r.mirror.stop();
  assert.deepEqual(r.state.touches.map((x) => x[0]), ['down', 'move', 'up'], 'levé à l\'arrêt');
});

test('Windows refuse l\'injection tactile : le glissement passe par la molette, comme avant', async () => {
  const r = rig({ rect: { x: 0, y: 0, width: 1000, height: 800 }, touch: 'refused' });
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  r.mirror.scroll({ t: 'mscroll', s: 1, fx: 0.5, fy: 0.5, dx: 0, dy: 0.25 });
  r.mirror.scroll({ t: 'mscroll', s: 2, fx: 0.5, fy: 0.5, dx: 0, dy: 0.1, end: true });
  assert.deepEqual(r.state.touches, [['down', 500, 400]], 'une seule tentative par glissement');
  assert.deepEqual(r.state.wheels, [[0, 200], [0, 80]]);
  // Un glissement qui ne fait que se terminer n'envoie rien.
  r.mirror.scroll({ t: 'mscroll', s: 3, fx: 0.5, fy: 0.5, dx: 0, dy: 0, end: true });
  assert.equal(r.state.wheels.length, 2);
});

test('journal : une ligne par glissement dit le mode, le départ, le nombre de messages et les pixels', async () => {
  const r = rig({ rect: { x: 100, y: 50, width: 1000, height: 800 }, touch: 'ok' });
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  // Aucun message du téléphone : aucune ligne (c'est la preuve que le téléphone n'a rien envoyé).
  assert.deepEqual(r.state.logs, []);
  r.mirror.scroll({ t: 'mscroll', s: 1, fx: 0.5, fy: 0.8, dx: 0, dy: -0.1 });
  r.mirror.scroll({ t: 'mscroll', s: 2, fx: 0.5, fy: 0.8, dx: 0, dy: -0.3 });
  assert.deepEqual(r.state.logs, [], 'pas de ligne tant que le doigt est posé');
  r.mirror.scroll({ t: 'mscroll', s: 3, fx: 0.5, fy: 0.8, dx: 0, dy: 0, end: true });
  assert.equal(r.state.logs.length, 1);
  assert.match(r.state.logs[0]!, /glissement au doigt \(injection tactile\) parti de \(600, 690\) dans une fenêtre de 1000 × 800, 3 message\(s\), 0 × -320 px$/);
  // Mode molette : la ligne le dit, et le téléphone sans doigt levé est clos après le silence.
  const w = rig({ rect: { x: 0, y: 0, width: 1000, height: 800 } });
  w.mirror.request(true, { w: 390, h: 700 });
  await w.advance(0);
  w.mirror.scroll({ t: 'mscroll', s: 1, fx: 0.5, fy: 0.5, dx: 0, dy: 0.25 });
  assert.deepEqual(w.state.logs, []);
  await w.advance(1600);
  assert.equal(w.state.logs.length, 1);
  assert.match(w.state.logs[0]!, /glissement à la molette parti de \(500, 400\) dans une fenêtre de 1000 × 800, 1 message\(s\), 0 × 200 px$/);
});

test('journal : les refus de Windows sont comptés, le glissement repasse par la molette', async () => {
  const r = rig({ rect: { x: 0, y: 0, width: 1000, height: 800 }, touch: 'refused' });
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  r.mirror.scroll({ t: 'mscroll', s: 1, fx: 0.5, fy: 0.5, dx: 0, dy: 0.25 });
  r.mirror.scroll({ t: 'mscroll', s: 2, fx: 0.5, fy: 0.5, dx: 0, dy: 0.1, end: true });
  assert.equal(r.state.logs.length, 1);
  assert.match(r.state.logs[0]!, /à la molette.*2 message\(s\), 0 × 280 px, 1 refus de Windows$/);
});

test('la télécommande qui ne pilote plus la fenêtre : appuis ignorés même si le miroir est demandé', async () => {
  const r = rig();
  r.mirror.request(true, { w: 390, h: 700 });
  await r.advance(0);
  r.state.live = false;
  r.mirror.tap({ t: 'tap', s: 1, fx: 0.5, fy: 0.5, button: 'left', count: 1 });
  assert.deepEqual(r.state.clicks, []);
});

// ---------------------------------------------------------------------------
// Rien d'automatique dans Edge

test('aucun port de débogage ni drapeau d\'automatisation : le miroir ne fait que capturer la fenêtre', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'phone-mirror.ts'), 'utf8');
  for (const word of ['remote-debugging', 'remote-allow-origins', 'enable-automation', 'DevToolsActivePort', 'puppeteer', 'playwright', 'webdriver']) {
    assert.equal(source.toLowerCase().includes(word.toLowerCase()), false, `phone-mirror.ts ne doit pas contenir « ${word} »`);
  }
  assert.ok(source.includes('desktopCapturer'));
  // Les fenêtres que le miroir montre sont lancées sans port de débogage.
  const args = appBrowserArgs('C:/profil', { x: 0, y: 0, width: 800, height: 600 }, 'https://example.com/').join(' ');
  assert.equal(args.includes('remote-debugging'), false);
  assert.equal(args.includes('enable-automation'), false);
});

// ---------------------------------------------------------------------------
// La page du téléphone (ce qui se lit dans les fichiers ; le geste réel : l'essai sur la borne)

const PHONE_DIR = path.join(REPO_ROOT, 'app', 'renderer', 'telephone');
const phonePage = fs.readFileSync(path.join(PHONE_DIR, 'telephone.html'), 'utf8');
const phoneMirror = fs.readFileSync(path.join(PHONE_DIR, 'telephone-miroir.js'), 'utf8');
const phoneMain = fs.readFileSync(path.join(PHONE_DIR, 'telephone.js'), 'utf8');
const phoneRemote = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'phone-remote.ts'), 'utf8');

test('page du téléphone : le module du miroir est servi, et chargé avant telephone.js', () => {
  assert.ok(phoneRemote.includes("'/telephone-miroir.js': 'telephone/telephone-miroir.js'"), 'entrée dans PHONE_FILES');
  const at = (name: string) => phonePage.indexOf(`<script src="${name}"></script>`);
  assert.ok(at('telephone-miroir.js') > -1, 'telephone-miroir.js chargé par la page');
  assert.ok(at('telephone-miroir.js') < at('telephone.js'), 'avant telephone.js');
});

test('page du téléphone : le pavé reste, le miroir est une option à côté', () => {
  assert.match(phonePage, /id="pad"/, 'le pavé tactile est toujours là');
  // La bascule est un bouton-icône de la barre d'outils du bas (plus de barre Pavé / Miroir), enfoncé quand le miroir est montré.
  assert.match(phonePage, /<nav class="tools" id="tools">[\s\S]*id="nav-mirror" aria-pressed="false"/, "bouton Miroir dans la barre d'outils");
  assert.equal(/mirror-seg|mirror-tab-/.test(phonePage), false, 'plus de barre Pavé / Miroir');
  assert.match(phoneMirror, /mirrorToggle\.addEventListener\('click', \(\) => mirrorChoose\(true\)\)/);
  assert.match(phoneMirror, /padToggle\.addEventListener\('click', \(\) => mirrorChoose\(false\)\)/);
  // Le choix se retient pour la session de la télécommande seulement.
  assert.match(phoneMirror, /sessionStorage/);
  assert.equal(/localStorage/.test(phoneMirror), false, 'le choix ne survit pas à la session');
});

test('page du téléphone : aucune demande tant que le miroir n\'est pas choisi, arrêt au retour au pavé', () => {
  // Le module n'émet « mirror on » que si le miroir est voulu (mirrorWanted : possible, choisi, navigateur, liaison, page visible).
  assert.match(phoneMirror, /function mirrorWanted\(\)[^}]*mirror\.choice[^}]*mode === 'browser'[^}]*state === 'paired'[^}]*!document\.hidden/);
  assert.match(phoneMirror, /send\(\{ t: 'mirror', on: false \}\)/);
  // L'accusé suit l'affichage : une seule image à la fois côté borne.
  assert.match(phoneMirror, /send\(\{ t: 'mirror-ack', n: m\.n \}\)/);
});

test('page du téléphone : les gestes du miroir sont ceux du brief (appui, glissement, appui long)', () => {
  assert.match(phoneMirror, /t: 'tap', fx: g\.fx, fy: g\.fy, button: 'left'/);
  assert.match(phoneMirror, /t: 'tap', fx: g\.fx, fy: g\.fy, button: 'right'/);
  assert.match(phoneMirror, /t: 'mscroll'/);
  // Deux doigts : la loupe du téléphone ; le zoom de la page d'Edge a ses deux boutons, un pas par appui.
  assert.match(phoneMirror, /t: 'mzoom', steps/);
  assert.equal(phoneMirror.includes('MIRROR_PINCH_STEP'), false, "le pincement ne zoome plus la page d'Edge");
  // Les images se dessinent sans URL (img-src 'self' de la page) : canvas, ni data: ni blob: dans la page.
  assert.match(phoneMirror, /createImageBitmap/);
  assert.equal(/data:image|URL\.createObjectURL/.test(phoneMirror), false);
});

test('page du téléphone : les messages de la borne sont branchés, et la liaison coupée est oubliée', () => {
  for (const hook of ["case 'frame':", "case 'mirror-state':", 'mirrorPage(m)', 'mirrorMode()', 'mirrorLinkLost()']) assert.ok(phoneMain.includes(hook), `telephone.js appelle ${hook}`);
});

// ---------------------------------------------------------------------------
// La page du téléphone exécutée avec un faux DOM : le fronton en paysage, l'aide qui s'efface

/** Charge telephone-miroir.js dans un contexte à faux DOM ; `area` : la place de l'image en pixels de l'écran. */
function loadMirrorPage(area: { width: number; height: number }, frameSize: { width: number; height: number }) {
  const sent: Array<Record<string, unknown>> = [];
  const classes = new Set<string>();
  const listeners = new Map<string, ((e: Record<string, unknown>) => void)[]>();
  const view = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: area.width, height: area.height, right: area.width, bottom: area.height }),
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    addEventListener: (type: string, fn: (e: Record<string, unknown>) => void) => void listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    setPointerCapture: () => undefined,
  };
  const calls: string[] = [];
  const locks: string[] = [];
  const context2d = { clearRect: () => undefined, setTransform: () => calls.push('setTransform'), translate: () => calls.push('translate'), rotate: () => calls.push('rotate'), drawImage: () => calls.push('drawImage') };
  const canvas = { width: 1, height: 1, style: {} as Record<string, string>, getContext: () => context2d, addEventListener: () => undefined };
  const tab = { setAttribute: () => undefined, addEventListener: () => undefined, replaceChildren: () => undefined };
  const resetListeners = new Map<string, ((e: Record<string, unknown>) => void)[]>();
  const zoomButton = { ...tab, addEventListener: (type: string, fn: (e: Record<string, unknown>) => void) => void resetListeners.set(type, [...(resetListeners.get(type) ?? []), fn]) };
  const pageZoomListeners = new Map<string, ((e: Record<string, unknown>) => void)[]>();
  const pageZoomButton = (key: string) => ({ ...tab, addEventListener: (type: string, fn: (e: Record<string, unknown>) => void) => void pageZoomListeners.set(key + type, [...(pageZoomListeners.get(key + type) ?? []), fn]) });
  const elements: Record<string, unknown> = { mirror: view, 'mirror-canvas': canvas, 'mirror-zoom-reset': zoomButton, 'mirror-page-zoom-in': pageZoomButton('in'), 'mirror-page-zoom-out': pageZoomButton('out'), 'nav-mirror': tab, 'nav-pad': tab };
  const sandbox: Record<string, unknown> = {
    document: { getElementById: (id: string) => elements[id], createElement: () => ({}), addEventListener: () => undefined, hidden: false, body: { dataset: {} } },
    window: { devicePixelRatio: 1, addEventListener: () => undefined },
    sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    screen: { orientation: { lock: (o: string) => (locks.push(o), Promise.resolve()), unlock: () => locks.push('unlock') } },
    navigator: {},
    t: (s: string) => s,
    cyberIcon: () => ({}),
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    Blob,
    Uint8Array,
    Math,
    Promise,
    createImageBitmap: async () => ({ ...frameSize, close: () => undefined }),
    clearTimeout,
    setTimeout,
    // Comme un navigateur : le rappel reçoit l'heure (un argument imprévu doit rester sans effet).
    requestAnimationFrame: (fn: (time: number) => void) => setTimeout(() => fn(16.7), 0),
    mode: 'browser',
    state: 'paired',
    send: (m: Record<string, unknown>) => (sent.push(m), true),
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(PHONE_DIR, 'telephone-miroir.js'), 'utf8'), context);
  vm.runInContext('mirror.available = true; mirror.choice = true;', context);
  // JSON : les objets d'un autre contexte vm ne passent pas deepEqual.
  const run = <T>(code: string) => { const v = vm.runInContext(code, context) as unknown; return (v === undefined || typeof (v as { then?: unknown }).then === 'function' ? v : JSON.parse(JSON.stringify(v))) as T; };
  /** Un événement du doigt sur la vue (pointerdown, pointermove, pointerup) ; `at` : l'heure en ms. */
  const touch = (type: 'pointerdown' | 'pointermove' | 'pointerup', id: number, x: number, y: number, at = 0) => {
    for (const fn of listeners.get(type) ?? []) fn({ type, pointerId: id, clientX: x, clientY: y, timeStamp: at, preventDefault: () => undefined });
  };
  const resetButton = () => void resetListeners.get('click')?.forEach((fn) => fn({}));
  /** Appui sur « Agrandir la page » (in) ou « Réduire la page » (out) ; rend si le doigt a été gardé hors de l'image (stopPropagation du pointerdown). */
  const pageZoom = (key: 'in' | 'out') => {
    let stopped = false;
    pageZoomListeners.get(key + 'pointerdown')?.forEach((fn) => fn({ stopPropagation: () => (stopped = true) }));
    pageZoomListeners.get(key + 'click')?.forEach((fn) => fn({}));
    return stopped;
  };
  /** Pincement : deux doigts posés puis écartés (ou rapprochés), milieu et écart donnés avant et après. */
  const pinch = (from: { cx: number; cy: number; gap: number }, to: { cx: number; cy: number; gap: number }) => {
    touch('pointerdown', 1, from.cx - from.gap / 2, from.cy);
    touch('pointerdown', 2, from.cx + from.gap / 2, from.cy);
    touch('pointermove', 1, to.cx - to.gap / 2, to.cy);
    touch('pointermove', 2, to.cx + to.gap / 2, to.cy);
    touch('pointerup', 1, to.cx - to.gap / 2, to.cy);
    touch('pointerup', 2, to.cx + to.gap / 2, to.cy);
  };
  return { sent, classes, canvas, calls, locks, run, touch, pinch, resetButton, pageZoom, frame: () => run<Promise<void>>("mirrorFrame({ n: 1, d: 'eA==' })") };
}

test('page du téléphone : le fronton (paysage) dans la place en portrait est tourné d\'un quart de tour, et un appui retombe au bon endroit', async () => {
  const page = loadMirrorPage({ width: 400, height: 800 }, { width: 1920, height: 1080 });
  await page.frame();
  assert.equal(page.run('mirror.turned'), true);
  assert.deepEqual([page.canvas.width, page.canvas.height], [1080, 1920], 'le canvas est en portrait');
  assert.ok(page.calls.includes('rotate'));
  // L'image tournée occupe toute la largeur (400) et 711 de hauteur, centrée : coin haut gauche de la fenêtre = coin haut droit de l'écran.
  const top = (800 - 400 * (1920 / 1080)) / 2;
  const at = (x: number, y: number) => page.run<{ fx: number; fy: number } | undefined>(`mirrorFraction(${x}, ${y}, false)`);
  const topRight = at(399.99, top + 0.01)!;
  assert.ok(topRight.fx < 0.001 && topRight.fy < 0.001, 'haut droit du téléphone = haut gauche de la fenêtre');
  const bottomLeft = at(0.01, 800 - top - 0.01)!;
  assert.ok(bottomLeft.fx > 0.999 && bottomLeft.fy > 0.999, 'bas gauche du téléphone = bas droit de la fenêtre');
  const centre = at(200, 400)!;
  assert.ok(Math.abs(centre.fx - 0.5) < 0.001 && Math.abs(centre.fy - 0.5) < 0.001);
  assert.equal(at(200, 5), undefined, 'hors de l\'image : aucun appui');
});

test('page du téléphone : la borne prépare l\'image pour la place tournée, et une fenêtre en portrait n\'est pas tournée', async () => {
  const landscape = loadMirrorPage({ width: 400, height: 800 }, { width: 1920, height: 1080 });
  assert.deepEqual(landscape.run('mirrorBox()'), { w: 400, h: 800 }, 'avant la première image : place telle quelle');
  await landscape.frame();
  assert.deepEqual(landscape.run('mirrorBox()'), { w: 800, h: 400 }, 'place échangée une fois l\'image connue en paysage');
  assert.ok(landscape.sent.some((m) => m.t === 'mirror' && m.on === true && m.w === 800 && m.h === 400), 'la borne en est avertie');

  const portrait = loadMirrorPage({ width: 400, height: 800 }, { width: 1080, height: 1920 });
  await portrait.frame();
  assert.equal(portrait.run('mirror.turned'), false, 'TikTok en portrait : image droite');
  assert.equal(portrait.calls.includes('rotate'), false);
  assert.deepEqual(portrait.run('mirrorBox()'), { w: 400, h: 800 });

  // Téléphone passé en paysage (verrou refusé) : le paysage s'affiche droit, sans rotation.
  const sideways = loadMirrorPage({ width: 800, height: 400 }, { width: 1920, height: 1080 });
  await sideways.frame();
  assert.equal(sideways.run('mirror.turned'), false);
});

test('page du téléphone : aucun texte en miroir (ni aide ni attente), seulement l\'image ou un point', async () => {
  const mirrorBlock = phonePage.slice(phonePage.indexOf('<div class="mirror" id="mirror">'), phonePage.indexOf('<div class="pad" id="pad">'));
  const texts = [...mirrorBlock.matchAll(/data-i18n>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(texts, ['La borne n\'arrive pas à capturer la fenêtre. Reviens au pavé.'], 'le seul texte est l\'erreur de capture');
  assert.equal(/hinting|mirrorHint/.test(phoneMirror), false, 'plus d\'aide temporaire');
  const page = loadMirrorPage({ width: 400, height: 800 }, { width: 1080, height: 1920 });
  await page.frame();
  assert.ok(page.classes.has('has-frame'));
  assert.equal(page.classes.has('hinting'), false);
});

test('page du téléphone : la page est verrouillée dans le sens de la fenêtre montrée, libérée au retour au pavé', async () => {
  // Le fronton (paysage) : paysage ; TikTok sur le playfield (portrait) : portrait ; retour au pavé : libre.
  const landscape = loadMirrorPage({ width: 400, height: 800 }, { width: 1920, height: 1080 });
  landscape.run('mirror.choice = false; mirrorChoose(true)');
  assert.deepEqual(landscape.locks, ['portrait'], 'avant la première image : portrait');
  await landscape.frame();
  assert.deepEqual(landscape.locks, ['portrait', 'landscape'], 'image en paysage : verrou en paysage');
  landscape.run('mirrorChoose(false)');
  assert.equal(landscape.locks.at(-1), 'unlock');

  const portrait = loadMirrorPage({ width: 400, height: 800 }, { width: 1080, height: 1920 });
  portrait.run('mirror.choice = false; mirrorChoose(true)');
  await portrait.frame();
  assert.deepEqual(portrait.locks, ['portrait'], 'fenêtre en portrait : le portrait reste');
});

// ---------------------------------------------------------------------------
// Loupe (pincement à deux doigts) et glissements, par le faux DOM

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Tap = { t: string; fx: number; fy: number; button?: string };
const taps = (sent: Array<Record<string, unknown>>) => sent.filter((m) => m.t === 'tap') as unknown as Tap[];
const near = (a: number, b: number, eps = 0.0006) => Math.abs(a - b) <= eps;
type Zoom = { s: number; tx: number; ty: number };
type Box = { x: number; y: number; w: number; h: number };

/** Fenêtre en portrait (1080 × 1920) dans une place 400 × 800 : l'image fait 400 × 711, bandes noires en haut et en bas. */
async function zoomPage() {
  const page = loadMirrorPage({ width: 400, height: 800 }, { width: 1080, height: 1920 });
  await page.frame();
  assert.equal(page.run('mirror.turned'), false);
  return page;
}

/** L'invariant de la loupe : un point de l'image, montré où l'agrandissement le met, se touche à la même fraction qu'avant. */
function assertTapsStayExact(page: Awaited<ReturnType<typeof zoomPage>>, z: Zoom) {
  const base = [[10, 60], [200, 400], [399, 740], [123, 321], [350, 100]];
  for (const [x, y] of base) {
    const before = page.run<{ fx: number; fy: number } | undefined>(`(() => { const z = mirror.zoom; mirror.zoom = { s: 1, tx: 0, ty: 0 }; const f = mirrorFraction(${x}, ${y}, false); mirror.zoom = z; return f; })()`);
    const after = page.run<{ fx: number; fy: number } | undefined>(`mirrorFraction(${z.tx + z.s * x!}, ${z.ty + z.s * y!}, false)`);
    assert.ok(before && after, `(${x}, ${y}) est dans l'image`);
    assert.ok(near(before.fx, after.fx) && near(before.fy, after.fy), `(${x}, ${y}) : ${JSON.stringify(before)} avant, ${JSON.stringify(after)} après la loupe`);
  }
}

test('loupe : le pincement agrandit autour des doigts, et les appuis tombent juste avant comme après', async () => {
  const page = await zoomPage();
  // Avant : un appui au milieu de la vue.
  page.touch('pointerdown', 1, 200, 400, 0);
  page.touch('pointerup', 1, 200, 400, 40);
  const [first] = taps(page.sent);
  assert.ok(first && near(first.fx, 0.5) && near(first.fy, 0.5), 'appui exact sans loupe');

  // Pincement centré en (300, 300) : l'écart double, l'image double.
  const under = page.run<{ fx: number; fy: number }>('mirrorFraction(300, 300, false)');
  page.pinch({ cx: 300, cy: 300, gap: 100 }, { cx: 300, cy: 300, gap: 200 });
  const zoom = page.run<Zoom>('mirror.zoom');
  assert.ok(near(zoom.s, 2, 0.001), `agrandissement ×2 (${zoom.s})`);
  assert.ok(page.classes.has('zoomed'));
  assert.match(page.canvas.style.transform ?? '', /scale\(2\)/);
  // Le point sous le milieu des doigts y est resté.
  const still = page.run<{ fx: number; fy: number }>('mirrorFraction(300, 300, false)');
  assert.ok(near(still.fx, under.fx) && near(still.fy, under.fy), 'le zoom est centré sur les doigts');
  assertTapsStayExact(page, zoom);

  // Un appui sur l'image agrandie part (après le délai d'un double appui possible), à la bonne fraction.
  page.touch('pointerdown', 3, 100, 100, 1000);
  page.touch('pointerup', 3, 100, 100, 1040);
  assert.equal(taps(page.sent).length, 1, 'retenu le temps d\'un double appui');
  await wait(340);
  const second = taps(page.sent)[1]!;
  const rect = page.run<Box>('mirrorImageRect()');
  assert.ok(near(second.fx, (100 - rect.x) / rect.w) && near(second.fy, (100 - rect.y) / rect.h), 'appui exact sous la loupe');
  assert.ok(near(second.fx, 0.5, 0.01), 'vue de 400 de large, image doublée, décalée de 300 : (100 + 300) / 800');
});

test('loupe : un doigt déplace le cadre agrandi (sans faire défiler la page), qui reste dans l\'image, et les appuis restent justes', async () => {
  const page = await zoomPage();
  page.pinch({ cx: 200, cy: 400, gap: 100 }, { cx: 200, cy: 400, gap: 300 });
  const z0 = page.run<Zoom>('mirror.zoom');
  assert.ok(near(z0.s, 3, 0.001));
  page.touch('pointerdown', 1, 200, 400, 0);
  page.touch('pointermove', 1, 230, 420, 20);
  page.touch('pointerup', 1, 230, 420, 40);
  const z1 = page.run<Zoom>('mirror.zoom');
  assert.ok(near(z1.tx, z0.tx + 30, 0.01) && near(z1.ty, z0.ty + 20, 0.01), 'le cadre suit le doigt');
  assert.equal(page.sent.filter((m) => m.t === 'mscroll').length, 0, 'aucun glissement envoyé à la page');
  assertTapsStayExact(page, z1);
  // Tiré très loin : le cadre bute sur le bord de l'image (plus de noir au-delà).
  page.touch('pointerdown', 1, 0, 0, 100);
  page.touch('pointermove', 1, 400, 800, 120);
  page.touch('pointerup', 1, 400, 800, 140);
  const edge = page.run<Box>('mirrorImageRect()');
  assert.ok(edge.x <= 0.001 && edge.x + edge.w >= 399.999, 'l\'image couvre la largeur de la vue');
  assert.ok(edge.y <= 0.001 && edge.y + edge.h >= 799.999, 'et sa hauteur');
  assertTapsStayExact(page, page.run<Zoom>('mirror.zoom'));
});

test('loupe : un double appui, ou le bouton, ramène au cadrage normal sans cliquer dans la page', async () => {
  const page = await zoomPage();
  page.pinch({ cx: 200, cy: 400, gap: 100 }, { cx: 200, cy: 400, gap: 250 });
  assert.ok(page.run<number>('mirror.zoom.s') > 2);
  // Double appui.
  page.touch('pointerdown', 1, 150, 350, 0);
  page.touch('pointerup', 1, 150, 350, 40);
  page.touch('pointerdown', 1, 155, 352, 150);
  page.touch('pointerup', 1, 155, 352, 190);
  assert.equal(page.run('mirror.zoom.s'), 1);
  assert.equal(page.classes.has('zoomed'), false);
  assert.equal(page.canvas.style.transform, '');
  await wait(340);
  assert.equal(taps(page.sent).length, 0, 'aucun clic n\'est parti dans la page');
  // Sans loupe, un appui part tout de suite, à la place exacte.
  page.touch('pointerdown', 1, 200, 400, 1000);
  page.touch('pointerup', 1, 200, 400, 1040);
  assert.equal(taps(page.sent).length, 1);
  // Le bouton fait la même chose.
  page.pinch({ cx: 200, cy: 400, gap: 100 }, { cx: 200, cy: 400, gap: 250 });
  assert.ok(page.run<number>('mirror.zoom.s') > 2);
  page.resetButton();
  assert.equal(page.run('mirror.zoom.s'), 1);
  assert.equal(page.classes.has('zoomed'), false);
});

test('loupe : bornée, un pincement à peine agrandi revient au cadrage normal, et la borne prépare une image plus fine', async () => {
  const page = await zoomPage();
  page.run('mirror.asked = true; mirror.box = { w: 400, h: 800 }');
  page.pinch({ cx: 200, cy: 400, gap: 100 }, { cx: 200, cy: 400, gap: 3000 });
  assert.equal(page.run('mirror.zoom.s'), 5, 'agrandissement le plus fort : ×5');
  assert.ok(page.sent.some((m) => m.t === 'mirror' && m.on === true && m.w === 800 && m.h === 1600), 'image plus fine demandée sous la loupe');
  page.resetButton();
  assert.equal(page.sent.filter((m) => m.t === 'mirror').at(-1)?.w, 400, 'cadrage normal : taille d\'avant');
  // Écarter de 2 % ne change rien.
  page.pinch({ cx: 200, cy: 400, gap: 100 }, { cx: 200, cy: 400, gap: 102 });
  assert.equal(page.run('mirror.zoom.s'), 1);
  // Pincer vers l'intérieur sans loupe : toujours ×1.
  page.pinch({ cx: 200, cy: 400, gap: 300 }, { cx: 200, cy: 400, gap: 50 });
  assert.equal(page.run('mirror.zoom.s'), 1);
});

test('glissement du doigt sans loupe : défilement de la page, doigt levé annoncé (end) pour finir le geste tactile', async () => {
  const page = await zoomPage();
  const imageH = 400 * (1920 / 1080);
  // Balayage vers le haut, commencé à (200, 600).
  page.touch('pointerdown', 1, 200, 600, 0);
  page.touch('pointermove', 1, 200, 500, 16);
  await wait(30);
  page.touch('pointermove', 1, 200, 300, 32);
  page.touch('pointerup', 1, 200, 300, 48);
  const slides = page.sent.filter((m) => m.t === 'mscroll') as unknown as { fx: number; fy: number; dx: number; dy: number; end?: boolean }[];
  assert.equal(slides.length, 2);
  assert.ok(near(slides[0]!.fy, (600 - (800 - imageH) / 2) / imageH, 0.001), 'commencé sous le doigt');
  assert.ok(slides[0]!.dy < 0 && slides[0]!.end === undefined);
  assert.ok(slides[1]!.dy < 0 && slides[1]!.end === true, 'le dernier message porte la levée du doigt');
  assert.ok(near(slides[0]!.dy + slides[1]!.dy, -300 / imageH, 0.001), 'tout le parcours du doigt est transmis');
  // Un appui sans mouvement n'envoie aucun glissement.
  page.sent.length = 0;
  page.touch('pointerdown', 1, 200, 400, 1000);
  page.touch('pointerup', 1, 200, 400, 1040);
  assert.equal(page.sent.filter((m) => m.t === 'mscroll').length, 0);
  assert.equal(taps(page.sent).length, 1);
});

test('glissement : le message lit end (doigt levé) et l\'ignore autrement', () => {
  assert.deepEqual(parsePhoneMessage({ t: 'mscroll', s: 7, fx: 0.2, fy: 0.3, dx: 0, dy: -0.4, end: true }), { t: 'mscroll', s: 7, fx: 0.2, fy: 0.3, dx: 0, dy: -0.4, end: true });
  assert.deepEqual(parsePhoneMessage({ t: 'mscroll', s: 7, fx: 0.2, fy: 0.3, dx: 0, dy: -0.4, end: 'oui' }), { t: 'mscroll', s: 7, fx: 0.2, fy: 0.3, dx: 0, dy: -0.4 });
});

test('page du téléphone : le bouton de retour au cadrage normal existe et est traduit, la loupe reste dans le module du miroir', () => {
  assert.match(phonePage, /id="mirror-zoom-reset"/);
  assert.match(phoneMirror, /t\('Cadrage normal'\)/);
  assert.equal(phoneMain.includes('mirror.zoom'), false);
});

test("zoom de la page d'Edge : deux boutons, un pas par appui, sans toucher à la loupe ni cliquer dans l'image", async () => {
  const page = await zoomPage();
  assert.equal(page.pageZoom('in'), true, "le doigt reste sur le bouton : pas de clic ni de glissement dans l'image");
  assert.equal(page.pageZoom('out'), true);
  assert.equal(page.pageZoom('out'), true);
  assert.deepEqual(page.sent.filter((m) => m.t === 'mzoom').map((m) => m.steps), [1, -1, -1]);
  assert.equal(page.run('mirror.zoom.s'), 1, "la loupe n'a pas bougé");
  assert.equal(taps(page.sent).length, 0);
  // Un pincement, lui, ne demande rien à Edge : c'est la loupe.
  page.sent.length = 0;
  page.pinch({ cx: 200, cy: 400, gap: 100 }, { cx: 200, cy: 400, gap: 250 });
  assert.equal(page.sent.some((m) => m.t === 'mzoom'), false);
  assert.ok(page.run<number>('mirror.zoom.s') > 2);
});

test("page du téléphone : les boutons de zoom de la page d'Edge existent et sont traduits", () => {
  assert.match(phonePage, /id="mirror-page-zoom-in"/);
  assert.match(phonePage, /id="mirror-page-zoom-out"/);
  assert.match(phoneMirror, /t\("Agrandir la page de la borne"\)/);
  assert.match(phoneMirror, /t\("Réduire la page de la borne"\)/);
});
