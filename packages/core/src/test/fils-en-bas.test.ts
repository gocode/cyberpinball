// Les fils de discussion s'ouvrent en bas, sur les derniers messages (19/11/2026 : groupes, salons et
// messages privés s'ouvraient en haut, sur les plus anciens). À la borne : le curseur sur la dernière
// ligne (app/src/chat-cursor.ts), le même calcul pour les trois écrans. Au téléphone : l'état « en bas »
// suivi aux gestes (app/renderer/telephone/telephone-bas.js), pour tout fil de la page, même dessiné
// caché ou repris après un autre onglet. Le groupe ouvert à la borne : telephone-groupes.test.ts.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

/* eslint-disable @typescript-eslint/no-require-imports */
const { lastLineAt } = require(path.join(REPO_ROOT, 'app', 'dist', 'chat-cursor.js')) as {
  lastLineAt(built: { actions: { key?: string }[] }): number | undefined;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const SRC = path.join(REPO_ROOT, 'app', 'src');
const PHONE = path.join(REPO_ROOT, 'app', 'renderer', 'telephone');

test('borne : le curseur sur la dernière ligne de la discussion, sinon aucun rang', () => {
  assert.equal(lastLineAt({ actions: [{ key: 'week' }, { key: 'line:a' }, { key: 'line:b' }, { key: 'compose' }, {}] }), 2);
  assert.equal(lastLineAt({ actions: [{ key: 'compose' }, {}] }), undefined);
});

test('borne : messages privés, salons et groupes s’ouvrent par le même calcul', () => {
  const opens: [string, RegExp][] = [
    ['chat-menu.ts', /function openThread\([\s\S]*?lib\.openCustom\(threadBuild\(key\), lastLineAt\(/],
    ['rooms-menu.ts', /function openRoom\([\s\S]*?lib\.openCustom\(buildRoom, lastRoomLineAt\(\)\)/],
    ['groups-menu.ts', /function openGroup\([\s\S]*?lib\.openCustom\(groupBuild\(g\), lastLineAt\(/],
  ];
  for (const [file, open] of opens) {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    assert.match(src, /import \{ lastLineAt \} from '\.\/chat-cursor';/, `${file} : chat-cursor.ts`);
    assert.match(src, open, `${file} : ouvert sur la dernière ligne`);
  }
});

/** Une liste qui défile, mesurée comme dans un navigateur ; `hide` la cache (position remise à zéro, sans événement). */
function fakeList(content: number, view: number) {
  const listeners: (() => void)[] = [];
  const list = {
    scrollHeight: content,
    clientHeight: view,
    _top: 0,
    get scrollTop() {
      return this._top;
    },
    set scrollTop(v: number) {
      if (!this.clientHeight) return;
      const next = Math.max(0, Math.min(v, this.scrollHeight - this.clientHeight));
      if (next === this._top) return;
      this._top = next;
      queue.push(() => listeners.forEach((l) => l()));
    },
    addEventListener: (type: string, l: () => void) => void (type === 'scroll' && listeners.push(l)),
  };
  return list;
}
/** Les événements scroll partent après le dessin, comme dans le navigateur. */
const queue: (() => void)[] = [];
const flush = () => queue.splice(0).forEach((f) => f());
const observers: { cb: () => void; target: unknown }[] = [];
const resized = (target: unknown) => observers.filter((o) => o.target === target).forEach((o) => o.cb());

/* eslint-disable @typescript-eslint/no-require-imports */
(globalThis as Record<string, unknown>).ResizeObserver = class {
  cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
  }
  observe(target: unknown) {
    observers.push({ cb: this.cb, target });
  }
};
const { CyberBottom } = require(path.join(PHONE, 'telephone-bas.js')) as {
  CyberBottom: { settle(list: unknown, key: string): void; reset(list: unknown): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('téléphone : un fil ouvert en bas ; un message arrivé le suit ; remonté lire, il n’est pas ramené', () => {
  const list = fakeList(1000, 300);
  CyberBottom.settle(list, 'ami-1');
  flush();
  assert.equal(list.scrollTop, 700, 'ouvert sur les derniers messages');
  list.scrollHeight = 1100;
  CyberBottom.settle(list, 'ami-1');
  flush();
  assert.equal(list.scrollTop, 800, 'en bas : le nouveau message est sous les yeux');
  list.scrollTop = 200;
  flush();
  list.scrollHeight = 1200;
  CyberBottom.settle(list, 'ami-1');
  flush();
  assert.equal(list.scrollTop, 200, 'remonté lire : la lecture ne saute pas');
  CyberBottom.settle(list, 'ami-2');
  flush();
  assert.equal(list.scrollTop, 900, 'un autre fil : en bas');
});

test('téléphone : un fil dessiné caché, puis montré, est en bas (19/11/2026)', () => {
  const list = fakeList(1000, 0);
  CyberBottom.settle(list, 'monde');
  flush();
  assert.equal(list.scrollTop, 0, 'caché : rien ne défile');
  CyberBottom.settle(list, 'monde');
  list.clientHeight = 300;
  resized(list);
  flush();
  assert.equal(list.scrollTop, 700, 'montré : sur les dernières lignes');
});

test('téléphone : un onglet quitté puis repris revient en bas, même remonté avant', () => {
  const list = fakeList(1000, 300);
  CyberBottom.settle(list, 'pays-FR');
  flush();
  list.scrollTop = 100;
  flush();
  // Onglet quitté : caché, la position retombe à zéro sans événement de geste.
  list.clientHeight = 0;
  list._top = 0;
  resized(list);
  flush();
  list.clientHeight = 300;
  resized(list);
  flush();
  assert.equal(list.scrollTop, 700, 'repris : sur les derniers messages');
  CyberBottom.reset(list);
  list.scrollTop = 100;
  flush();
  CyberBottom.settle(list, 'pays-FR');
  flush();
  assert.equal(list.scrollTop, 700, 'rouvert (même salon) : en bas');
});

test('téléphone : chaque fil passe par telephone-bas.js, servi et chargé avant les pages qui l’emploient', () => {
  const community = fs.readFileSync(path.join(PHONE, 'telephone-community.js'), 'utf8');
  const main = fs.readFileSync(path.join(PHONE, 'telephone.js'), 'utf8');
  assert.match(community, /CyberBottom\.settle\(list, r\.room\)/, 'salons');
  assert.match(community, /CyberBottom\.settle\(lines, th\.key\)/, 'messages privés et groupes');
  assert.match(main, /CyberBottom\.settle\(list, chat\.key\)/, 'fil en partie');
  for (const [name, src] of [['telephone-community.js', community], ['telephone.js', main]] as const) {
    assert.doesNotMatch(src, /\.scrollTop = \w+\.scrollHeight/, `${name} : plus de défilement vers le bas mesuré au dessin`);
  }
  const html = fs.readFileSync(path.join(PHONE, 'telephone.html'), 'utf8');
  const at = (f: string) => html.indexOf(`<script src="${f}">`);
  assert.ok(at('telephone-bas.js') > -1 && at('telephone-bas.js') < at('telephone-community.js') && at('telephone-bas.js') < at('telephone.js'));
  assert.match(fs.readFileSync(path.join(SRC, 'phone-remote.ts'), 'utf8'), /'\/telephone-bas\.js': 'telephone\/telephone-bas\.js'/);
});
