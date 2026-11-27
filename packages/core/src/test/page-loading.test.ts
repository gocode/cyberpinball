// Chargement d'une page d'application (page-loading.ts) : le liseré ne doit jamais mentir. Il s'allume
// quand le cadre principal commence à charger, s'éteint quand il finit, ignore les cadres enfants, voit
// une page déjà en cours de chargement, et s'éteint si Edge part. Le tube de débogage n'est jamais un
// port : aucun argument de port, et la connexion Google (youtube-account.ts) reste sans débogage.
// Messages du protocole fictifs ; le faux Edge est deux flux.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { PAGE_LOADING_ARGS, PipeDecoder, appBrowserArgs, createPageLoadTracker, edgeLoginArgs } from '..';

const APP_DIST = path.resolve(__dirname, '../../../../app/dist');

const frame = (o: object) => JSON.stringify(o) + '\0';
const attach = { method: 'Target.attachedToTarget', params: { sessionId: 'S1', targetInfo: { type: 'page', targetId: 'T1' } } };

function tracker() {
  const sent: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const changes: boolean[] = [];
  const t = createPageLoadTracker({ send: (c) => sent.push(JSON.parse(c.replace(/\0$/, ''))), onChange: (l) => changes.push(l) });
  return { t, sent, changes };
}

test('PipeDecoder : messages recollés, coupés n\'importe où, illisibles ignorés', () => {
  const d = new PipeDecoder();
  const all = frame({ a: 1 }) + frame({ b: 2 });
  assert.deepEqual(d.push(all.slice(0, 5)), []);
  assert.deepEqual(d.push(all.slice(5, 12)), [{ a: 1 }]);
  assert.deepEqual(d.push(all.slice(12)), [{ b: 2 }]);
  assert.deepEqual(d.push('pas du json\0' + frame({ c: 3 })), [{ c: 3 }]);
});

test('le suivi : allumé de frameStartedLoading à frameStoppedLoading du cadre principal', () => {
  const { t, sent, changes } = tracker();
  t.start();
  assert.equal(sent[0].method, 'Target.setDiscoverTargets');
  t.receive({ method: 'Target.targetCreated', params: { targetInfo: { type: 'page', targetId: 'T1' } } });
  assert.equal(sent[1].method, 'Target.attachToTarget');
  t.receive({ method: 'Target.targetCreated', params: { targetInfo: { type: 'service_worker', targetId: 'W' } } });
  assert.equal(sent.length, 2, 'seules les pages sont suivies');
  t.receive(attach);
  const tree = sent.find((m) => m.method === 'Page.getFrameTree');
  const state = sent.find((m) => m.method === 'Runtime.evaluate');
  assert.equal(tree.sessionId, 'S1');
  t.receive({ id: tree.id, sessionId: 'S1', result: { frameTree: { frame: { id: 'MAIN' } } } });
  t.receive({ id: state.id, sessionId: 'S1', result: { result: { value: 'complete' } } });
  assert.deepEqual(changes, [], 'page chargée : rien');

  t.receive({ method: 'Page.frameStartedLoading', sessionId: 'S1', params: { frameId: 'MAIN' } });
  assert.equal(t.loading(), true);
  t.receive({ method: 'Page.frameStartedLoading', sessionId: 'S1', params: { frameId: 'PUB' } });
  t.receive({ method: 'Page.frameStoppedLoading', sessionId: 'S1', params: { frameId: 'PUB' } });
  assert.equal(t.loading(), true, 'un cadre enfant qui finit n\'éteint pas la page');
  t.receive({ method: 'Page.frameStoppedLoading', sessionId: 'S1', params: { frameId: 'MAIN' } });
  assert.equal(t.loading(), false);
  t.receive({ method: 'Page.frameStartedLoading', sessionId: 'S1', params: { frameId: 'PUB' } });
  assert.equal(t.loading(), false, 'un cadre enfant seul n\'allume pas');
  // Edge actuel signale le début d'une navigation avant tout chargement (mesuré sur un vrai Edge) ; la même page n'allume rien.
  t.receive({ method: 'Page.frameStartedNavigating', sessionId: 'S1', params: { frameId: 'MAIN', navigationType: 'sameDocument' } });
  assert.equal(t.loading(), false);
  t.receive({ method: 'Page.frameStartedNavigating', sessionId: 'S1', params: { frameId: 'MAIN', navigationType: 'differentDocument' } });
  assert.equal(t.loading(), true);
  t.receive({ method: 'Page.frameStoppedLoading', sessionId: 'S1', params: { frameId: 'MAIN' } });
  assert.deepEqual(changes, [true, false, true, false]);
});

test('le suivi : page déjà en chargement à l\'attache, page fermée', () => {
  const { t, sent, changes } = tracker();
  t.receive(attach);
  const state = sent.find((m) => m.method === 'Runtime.evaluate');
  t.receive({ id: state.id, sessionId: 'S1', result: { result: { value: 'loading' } } });
  assert.equal(t.loading(), true);
  t.receive({ method: 'Target.detachedFromTarget', params: { sessionId: 'S1' } });
  assert.deepEqual(changes, [true, false]);
});

test('watchPageLoading : le tube d\'Edge allume puis éteint, Edge parti éteint', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { watchPageLoading } = require(path.join(APP_DIST, 'page-loading.js')) as { watchPageLoading: (child: unknown, on: (l: boolean) => void) => void };
  const commands = new PassThrough();
  const answers = new PassThrough();
  const child = Object.assign(new EventEmitter(), { stdio: [null, null, null, commands, answers] });
  const written: string[] = [];
  commands.on('data', (c: Buffer) => written.push(c.toString()));
  const changes: boolean[] = [];
  watchPageLoading(child, (l) => changes.push(l));
  assert.match(written.join(''), /Target\.setDiscoverTargets/);
  answers.write(frame({ method: 'Target.attachedToTarget', params: { sessionId: 'S', targetInfo: { type: 'page' } } }).slice(0, 20));
  answers.write(frame({ method: 'Target.attachedToTarget', params: { sessionId: 'S', targetInfo: { type: 'page' } } }).slice(20) + frame({ method: 'Page.frameStartedLoading', sessionId: 'S', params: { frameId: 'F' } }));
  assert.deepEqual(changes, [true]);
  child.emit('exit');
  assert.deepEqual(changes, [true, false]);
});

test('aucun port de débogage : le tube est le seul argument, la connexion Google reste sans débogage', () => {
  assert.deepEqual([...PAGE_LOADING_ARGS], ['--remote-debugging-pipe']);
  const at = { x: 0, y: 0, width: 800, height: 600 };
  assert.equal(appBrowserArgs('p', at, 'https://a.example.com/').some((a) => /remote-debugging|enable-automation/.test(a)), false);
  assert.equal(edgeLoginArgs('p', at, 'https://a.example.com/').some((a) => /remote-debugging/.test(a)), false);
});

test('le liseré a la couleur de l\'application, jamais autre chose qu\'un #rrggbb', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { stripColor } = require(path.join(APP_DIST, 'page-loading.js')) as { stripColor: (c: string) => string };
  assert.equal(stripColor('#e50914'), '#e50914');
  assert.equal(stripColor("red');alert(1);('"), '#ffffff');
});
