// Carte « Objectif » du chargement (maquettes de l'engagement validées le 21/11/2026). Règle du
// mainteneur : un média de chargement choisi par le joueur n'est jamais recouvert. Ces tests fixent :
// - en borne, avec un média de chargement (vidéo ou image Loading), rien par-dessus : aucune carte ;
// - en borne, sans média, la carte sur l'écran de repli, sous la barre d'attente ;
// - au bureau, la carte dans l'encart à droite du cadre, jamais dans le cadre du média ;
// - aucun son ajouté : le rendu de la carte ne touche à aucun son ;
// - le processus principal ne la donne ni pendant le réglage de l'affichage, ni en invité ou jeu local.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { APP, menuRenderer } from './menu-renderer';
import { frontendSource } from './frontend-source';

const VIDEO = 'cyber-media://fichier/D%3A%5CT%5CNeon%5Cmedias%5C(Loading)%20Neon.webm?v=1';
const IMAGE = 'cyber-media://fichier/D%3A%5CT%5CNeon%5Cmedias%5C(Loading)%20Neon.png?v=1';
const OBJECTIVE = { label: 'OBJECTIF', name: 'Battre Léa', score: '9 450 000', avatar: { initials: 'LÉ', hue: 260, level: 18 }, lines: ['Votre record : 8 912 340 · il manque 537 660', 'Record du jour · France : Paul · 10 340 000'] };

function loadingState(media: 'video' | 'image' | 'none') {
  const title = 'Neon Galaxy';
  return {
    role: 'playfield',
    phase: 'loading',
    help: false,
    count: 3,
    position: 2,
    table: { title, manufacturer: 'Williams', year: '1992', subtitle: 'Williams · 1992' },
    neighbors: [],
    menuLayout: 'medaillons',
    medias: {},
    preload: [],
    loading:
      media === 'none'
        ? { role: 'playfield', type: 'Loading', source: 'fallback', fallback: 'loading-screen', fit: 'cover', rotation: 0, card: { title } }
        : { role: 'playfield', type: 'Loading', source: 'file', url: media === 'video' ? VIDEO : IMAGE, kind: media, fit: 'cover', rotation: 0, card: { title } },
    footer: [],
    menuKeys: [],
    gameKeys: [['Start', '1']],
    loadingKeys: { title: 'Commandes de la partie', rows: [['Start', '1']], display: false },
    objective: OBJECTIVE,
    nav: {},
  };
}

function renderer(shape: 'cab' | 'desktop') {
  const CyberFallback = {
    loading(box: { ownerDocument: { createElement(tag: string): { className: string; append(n: unknown): void } }; append(n: unknown): void }) {
      const doc = box.ownerDocument;
      const root = doc.createElement('div');
      root.className = 'cp-fb cp-fb-loading';
      const slot = doc.createElement('div');
      slot.className = 'cp-ld-slot';
      root.append(slot);
      box.append(root);
      return { slot, destroy() {} };
    },
  };
  const page = menuRenderer({ CyberFallback });
  const Media = Object.getPrototypeOf(page.document.createElement('video'));
  Media.play = () => Promise.resolve();
  Media.pause = () => {};
  const html = page.document.documentElement;
  html.classList.toggle('menu-desktop', shape === 'desktop');
  html.classList.toggle('menu-cab', shape === 'cab');
  return { ...page, root: page.document.getElementById('root')! };
}

test('objectif au chargement, en borne : jamais sur un média de chargement du joueur (vidéo ou image)', () => {
  for (const media of ['video', 'image'] as const) {
    const { send, root, document } = renderer('cab');
    send(loadingState(media));
    assert.equal(document.querySelector('.loading-objective'), null, `${media} : aucune carte Objectif sur le média du joueur`);
    assert.equal(root.textContent!.trim(), '', `${media} : rien par-dessus le média`);
  }
});

test('objectif au chargement, en borne sans média : la carte sur l’écran de repli, sous la barre d’attente', () => {
  const { send, root } = renderer('cab');
  send(loadingState('none'));
  const card = root.querySelector('.loading-fallback .cp-ld-slot .loading-objective');
  assert.ok(card, 'la carte dans le repli');
  assert.equal(card!.querySelector('.loading-objective-name')!.textContent, 'Battre Léa');
  assert.equal(card!.querySelector('.loading-objective-score')!.textContent, '9 450 000');
  assert.equal(card!.querySelectorAll('.loading-objective-detail').length, 2);
  // Sans objectif (version en calcul, partage coupé) : le repli seul.
  const other = renderer('cab');
  other.send({ ...loadingState('none'), objective: undefined });
  assert.equal(other.root.querySelector('.loading-objective'), null);
});

test('objectif au chargement, au bureau : dans l’encart à droite du cadre, jamais dans le cadre du média', () => {
  for (const media of ['video', 'none'] as const) {
    const { send, root } = renderer('desktop');
    send(loadingState(media));
    const cards = root.querySelectorAll('.loading-objective');
    assert.equal(cards.length, 1, `${media} : une seule carte`);
    assert.ok(cards[0]!.closest('.loading-card'), `${media} : dans l’encart`);
    assert.equal(root.querySelector('.loading-fallback .loading-objective'), null, `${media} : rien dans le cadre du média`);
  }
});

test('objectif au chargement : aucun son, et le processus principal ne la donne ni au réglage de l’affichage, ni en invité ou jeu local', () => {
  const js = fs.readFileSync(path.join(APP, 'renderer', 'frontend.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = js.indexOf('function objectiveCard(');
  const body = js.slice(start, js.indexOf('\n}\n', start));
  assert.ok(start > 0, 'objectiveCard existe');
  assert.doesNotMatch(body, /play|Audio|sound|son\(/i, 'la carte ne joue aucun son');
  const main = frontendSource();
  assert.match(main, /objective: state\.phase === 'loading' && role === 'playfield' && !displayMode \? loadingObjectiveFor\(playing \?\? table\) : undefined/);
  assert.match(main, /function loadingObjectiveFor\(table: TableEntry \| undefined\)[\s\S]{0,200}socialClosed\(\)/);
});
