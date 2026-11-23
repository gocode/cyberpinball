import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { parseHTML } from 'linkedom';
import { mediaErrorKind, readMediaErrors, recordMediaError } from '../mediaerrors';
import { REPO_ROOT } from './i18n-scan';

const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

test('télécommande : les cycles de rattachement ne cumulent aucun écouteur du navigateur ou de sa fenêtre', () => {
  const { remoteTargetEvents } = require(path.join(REPO_ROOT, 'app/dist/remote-target-events.js'));
  const contents = new EventEmitter();
  const win = new EventEmitter();
  const baseline = () => {};
  contents.on('did-stop-loading', baseline);
  let pages = 0;
  let fields = 0;
  let closed = 0;
  for (let i = 0; i < 30; i++) {
    const detach = remoteTargetEvents(contents, win, { page: () => pages++, field: () => fields++, closed: () => closed++ });
    assert.equal(contents.listenerCount('did-stop-loading'), 3);
    assert.equal(win.listenerCount('closed'), 1);
    contents.emit('did-stop-loading');
    win.emit('closed');
    detach();
    detach();
    assert.equal(contents.listenerCount('did-stop-loading'), 1, 'l’écouteur de l’autre composant est gardé');
    assert.equal(contents.listenerCount('did-navigate'), 0);
    assert.equal(win.listenerCount('closed'), 0);
  }
  assert.deepEqual([pages, fields, closed], [30, 30, 30], 'chaque événement n’est transmis qu’une fois');
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app/src/phone-remote.ts'), 'utf8');
  assert.match(source, /detachTargetEvents = remoteTargetEvents\(/);
  assert.match(source, /function detach\(\): void \{\s*if \(!target\) return;\s*detachTargetEvents\?\.\(\);/);
});

test('couleurs : une seule mesure, les anciennes tables sont abandonnées entre deux médias', async () => {
  const { TableTints } = require(path.join(REPO_ROOT, 'app/dist/table-tint.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teintes-attente-'));
  const measured: string[] = [];
  let finish!: (value: unknown) => void;
  const result = { width: 1, height: 1, images: [{ width: 1, height: 1, data: Buffer.from([30, 90, 230, 255]) }] };
  for (const file of ['ancien.png', 'ancien-dmd.png', 'intermediaire.png', 'dernier.png']) fs.writeFileSync(path.join(dir, file), file);
  const tints = new TableTints({ dataDir: dir, settleMs: 1, onChange() {}, converter: () => ({ mediaFrames(file: string) {
    measured.push(path.basename(file));
    return measured.length === 1 ? new Promise((resolve) => (finish = resolve)) : Promise.resolve(result);
  } }) });
  try {
    tints.follow({ key: 'ancien', files: [path.join(dir, 'ancien.png')], dmdFiles: [path.join(dir, 'ancien-dmd.png')] });
    await wait();
    tints.follow({ key: 'intermediaire', files: [path.join(dir, 'intermediaire.png')] });
    await wait();
    tints.follow({ key: 'dernier', files: [path.join(dir, 'dernier.png')] });
    await wait();
    assert.deepEqual(measured, ['ancien.png'], 'pas de deuxième décodeur pendant une mesure lente');
    finish(result);
    await wait();
    assert.deepEqual(measured, ['ancien.png', 'dernier.png'], 'ni le DMD abandonné ni le sujet remplacé ne sont mesurés');
    assert.ok(tints.current());
  } finally { tints.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('couleurs : un échec de décodeur attend avant de réessayer et ne condamne pas le fichier sur disque', async () => {
  const { TableTints } = require(path.join(REPO_ROOT, 'app/dist/table-tint.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teintes-reprise-'));
  const file = path.join(dir, 'video.mp4');
  fs.writeFileSync(file, 'video');
  let attempts = 0;
  let now = 1000;
  const options = { dataDir: dir, settleMs: 1, now: () => now, onChange() {}, converter: () => ({ mediaFrames: async () => { attempts++; throw new Error('video'); } }) };
  const tints = new TableTints(options);
  try {
    for (let i = 0; i < 3; i++) { tints.follow({ key: String(i), files: [file] }); await wait(); }
    assert.equal(attempts, 1);
    now += 60_001;
    tints.follow({ key: 'apres', files: [file] }); await wait();
    assert.equal(attempts, 2, 'l’échec transitoire peut récupérer');
    fs.writeFileSync(file, 'video remplacee');
    tints.follow({ key: 'remplace', files: [file] }); await wait();
    assert.equal(attempts, 3, 'un média remplacé est réessayé aussitôt');
    assert.equal(fs.existsSync(path.join(dir, 'cache/teintes-tables.json')), false, 'aucun refus durable');
  } finally { tints.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

function framePage(mode: 'ok' | 'seek-error' | 'seek-hung' | 'post-error' | 'image') {
  const { MEDIA_FRAMES_SCRIPT } = require(path.join(REPO_ROOT, 'app/dist/media-frames-script.js'));
  let cleaned = 0;
  let revoked = 0;
  let closed = 0;
  let at = 0;
  const reader: Record<string, any> = {
    duration: 10, videoWidth: 10, videoHeight: 5,
    pause() {}, removeAttribute() {}, load() { cleaned++; },
    set src(_value: string) { queueMicrotask(() => reader.onloadeddata?.()); },
    get currentTime() { return at; },
    set currentTime(value: number) {
      if (value === at) return;
      at = value;
      if (mode === 'seek-hung') return;
      queueMicrotask(() => mode === 'seek-error' ? reader.onerror?.() : reader.onseeked?.());
    },
  };
  const ctx: Record<string, any> = { AbortController,
    setTimeout: (fn: () => void) => setTimeout(fn, 30), clearTimeout,
    URL: { createObjectURL: () => 'blob:video', revokeObjectURL: () => revoked++ },
    document: { createElement: () => reader },
    createImageBitmap: async () => ({ width: 10, height: 5, close: () => closed++ }),
    fetch: async (url: string) => {
      if (url.startsWith('/out/') && mode === 'post-error') throw new Error('post failed');
      return { blob: async () => ({}) };
    },
    OffscreenCanvas: class { constructor(_w: number, _h: number) {} getContext() { return { drawImage() {}, getImageData: () => ({ data: Buffer.alloc(8) }) }; } },
  };
  ctx.window = ctx;
  vm.runInNewContext(MEDIA_FRAMES_SCRIPT, ctx);
  return { run: () => ctx.framesOf('a', mode !== 'image', [0, 0.5], 4, 'f'), state: () => ({ cleaned, revoked, closed }) };
}

test('mesure vidéo : même position sans seek, décodeur libéré après succès, erreur et délai', async () => {
  for (const mode of ['ok', 'seek-error', 'seek-hung', 'post-error'] as const) {
    const page = framePage(mode);
    if (mode === 'ok') assert.equal((await page.run()).count, 2);
    else await assert.rejects(page.run());
    assert.deepEqual(page.state(), { cleaned: 1, revoked: 1, closed: 0 }, mode);
  }
  const page = framePage('image');
  await page.run();
  assert.equal(page.state().closed, 1, 'bitmap libéré');
});

test('médias : une déconnexion du service graphique ne devient pas une erreur durable du fichier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-deconnexion-'));
  try {
    const file = path.join(dir, 'video.mp4');
    const log = path.join(dir, 'errors.json');
    fs.writeFileSync(file, 'video');
    assert.equal(mediaErrorKind({ code: 3, message: 'PIPELINE_ERROR_DISCONNECTED: video decode error!' }), undefined);
    assert.equal(recordMediaError(log, { file, code: 3, message: 'PIPELINE_ERROR_DISCONNECTED' }), undefined);
    assert.equal(fs.existsSync(log), false);
    const entry = recordMediaError(log, { file, code: 3, message: 'PIPELINE_ERROR_DECODE' });
    assert.ok(entry);
    fs.writeFileSync(log, JSON.stringify({ version: 1, errors: [{ ...entry, message: 'PIPELINE_ERROR_DISCONNECTED' }] }));
    assert.deepEqual(readMediaErrors(log), [], 'ancienne fausse accusation retirée aussi');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rendu : une vidéo déconnectée est rechargée une seule fois et ses écouteurs sont retirés', async () => {
  const { document, window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const videos: any[] = [];
  const create = document.createElement.bind(document);
  let loads = 0;
  document.createElement = ((tag: string) => {
    const node = create(tag) as any;
    if (tag === 'video') {
      node.pause = () => {};
      node.play = async () => {};
      node.load = () => loads++;
      node.readyState = 2;
      videos.push(node);
    }
    return node;
  }) as typeof document.createElement;
  const ctx: Record<string, any> = { document, Image: () => create('img'), t: (s: string) => s, setInterval, clearInterval,
    setTimeout: (fn: () => void, ms: number) => { const timer = setTimeout(fn, ms === 300 ? 1 : ms); timer.unref(); return timer; }, clearTimeout,
    requestAnimationFrame: (fn: () => void) => fn(), getComputedStyle: () => ({ fontSize: '16px' }),
    cyber: { mediaError() {} },
  };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'app/renderer/media.js'), 'utf8'), ctx);
  const layer = ctx.CyberMedia.layer(document.getElementById('root'));
  layer.show({ url: 'cyber-media://medias/video.mp4', kind: 'video', fit: 'contain', rotation: 0 });
  const video = videos[0];
  video.error = { code: 3, message: 'PIPELINE_ERROR_DISCONNECTED' };
  video.dispatchEvent(new window.Event('error'));
  await wait();
  assert.equal(loads, 1, 'une reprise avec un décodeur neuf');
  video.dispatchEvent(new window.Event('error'));
  await wait();
  assert.equal(loads, 2, 'second échec : uniquement le déchargement du lecteur');
  video.dispatchEvent(new window.Event('loadeddata'));
  assert.equal(document.querySelector('video'), null, 'le lecteur tombé ne revient pas après son remplacement');
  layer.destroy();
});
