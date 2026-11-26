// Miroir du navigateur sur le téléphone (remote-mirror.ts, app/src/phone-mirror.ts) : ce qui doit
// rester vrai quelle que soit la borne. La conversion d'un point de l'image en pixel du bureau
// (fenêtre à coordonnées négatives, écran en portrait), une seule image en vol, aucune capture sans
// demande du téléphone, aucun port de débogage dans Edge, et le pavé tactile inchangé. Tout se joue
// avec de fausses captures et une fausse horloge : aucune fenêtre, aucun Edge.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { appBrowserArgs } from '../applications';
import {
  MIRROR_BOX_MAX,
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
  now(): number;
  after(ms: number, fn: () => void): () => void;
}
interface Mirror {
  request(on: boolean, box: { w: number; h: number }): void;
  ack(n: number): void;
  tap(m: { t: 'tap'; s: number; fx: number; fy: number; button: 'left' | 'right'; count: 1 | 2 }): void;
  scroll(m: { t: 'mscroll'; s: number; fx: number; fy: number; dx: number; dy: number }): void;
  readonly active: boolean;
  stop(): void;
}

function rig(opts: { rect?: MirrorRect; live?: boolean } = {}) {
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
  assert.match(phonePage, /id="mirror-tab-pad"[^>]*>Pavé</, 'bouton Pavé');
  assert.match(phonePage, /id="mirror-tab-mirror"[^>]*>Miroir</, 'bouton Miroir');
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
  // Les images se dessinent sans URL (img-src 'self' de la page) : canvas, ni data: ni blob: dans la page.
  assert.match(phoneMirror, /createImageBitmap/);
  assert.equal(/data:image|URL\.createObjectURL/.test(phoneMirror), false);
});

test('page du téléphone : les messages de la borne sont branchés, et la liaison coupée est oubliée', () => {
  for (const hook of ["case 'frame':", "case 'mirror-state':", 'mirrorPage(m)', 'mirrorMode()', 'mirrorLinkLost()']) assert.ok(phoneMain.includes(hook), `telephone.js appelle ${hook}`);
});
