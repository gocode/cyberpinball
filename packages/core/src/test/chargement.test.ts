// Écran de chargement d'une table (octobre 2026 : « Le loading est moche sur
// desktop »). En borne, le média de chargement prend tout l'écran du plateau, seul : ni titre,
// ni état, ni commandes. Au bureau, le média dans le cadre 9:16 du menu, à gauche, et un
// encart unique à sa droite (titre, état, commandes), aux mêmes cotes que le cadre, qui ne le
// recouvre jamais. Le rendu réel est aussi contrôlé par le garde-fou de mise en page
// (layout-check.ts, html.loading-phase) dans les démonstrations (docs\demo-chargement.ps1).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { APP, menuRenderer } from './menu-renderer';

const VIDEO = 'cyber-media://fichier/D%3A%5CT%5CNeon%5Cmedias%5C(Loading)%20Neon.webm?v=1';
const GAME_ROWS: [string, string][] = [
  ['Flippers', 'Maj gauche / Maj droite'],
  ['Lanceur', 'Entrée'],
  ['Crédit', '5'],
  ['Start', '1'],
  ['Quitter la partie', 'Échap'],
  ['Menu de VPX', 'Ctrl gauche + Ctrl droit'],
];

/** État du chargement comme viewFor (frontend.ts) l'envoie au playfield. */
function loadingState(opts: { video?: boolean; display?: boolean; title?: string } = {}) {
  const title = opts.title ?? 'Neon Galaxy';
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
    loading: opts.video
      ? { role: 'playfield', type: 'Loading', source: 'file', url: VIDEO, kind: 'video', fit: 'cover', rotation: 0, card: { title } }
      : { role: 'playfield', type: 'Loading', source: 'fallback', fallback: 'loading-screen', fit: 'cover', rotation: 0, card: { title } },
    footer: [],
    menuKeys: [],
    gameKeys: GAME_ROWS,
    loadingKeys: opts.display
      ? { title: 'Réglage de l’affichage', rows: [['Changer de ligne', 'Ctrl gauche / Ctrl droit'], ['Régler', 'Maj gauche / Maj droite']], display: true }
      : { title: 'Commandes de la partie', rows: GAME_ROWS, display: false },
    nav: {},
  };
}

/** Rendu du menu avec un écran de chargement de secours simulé (fallback.js), qui retient ses appels. */
function renderer(shape: 'cab' | 'desktop') {
  const calls: { title: string; options: { label?: boolean } }[] = [];
  const CyberFallback = {
    loading(box: { ownerDocument: { createElement(tag: string): { className: string; append(n: unknown): void } }; append(n: unknown): void }, game: { title: string }, options: { label?: boolean }) {
      calls.push({ title: game.title, options });
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
  // Pas de lecture de vidéo dans linkedom.
  const Media = Object.getPrototypeOf(page.document.createElement('video'));
  Media.play = () => Promise.resolve();
  Media.pause = () => {};
  const html = page.document.documentElement;
  html.classList.toggle('menu-desktop', shape === 'desktop');
  html.classList.toggle('menu-cab', shape === 'cab');
  const root = page.document.getElementById('root')!;
  return { ...page, root, calls };
}

test('chargement en borne : le média de chargement seul, ni titre, ni état, ni commandes', () => {
  const { send, root, document } = renderer('cab');
  send(loadingState({ video: true }));
  assert.equal(root.children.length, 0, 'rien par-dessus le média');
  assert.equal(root.textContent!.trim(), '');
  assert.ok(document.documentElement.classList.contains('loading-video'), 'média de chargement plein, sans voile');
  assert.ok(document.documentElement.classList.contains('loading-phase'), 'garde-fou de mise en page prévenu');
});

test('chargement en borne sans média : le repli plein écran, sans son libellé ni commandes', () => {
  const { send, root, calls } = renderer('cab');
  send(loadingState());
  assert.equal(root.children.length, 1);
  const box = root.firstElementChild!;
  assert.ok(box.classList.contains('loading-fallback') && box.classList.contains('full'), 'repli sur tout le playfield');
  assert.deepEqual(calls.map((c) => c.options.label), [false], '« Chargement de la table… » retiré du repli');
  assert.equal(root.querySelector('.game-keys'), null, 'aucune commande');
  assert.equal(root.querySelector('h1, .lead, .loading-card'), null, 'aucun titre ni état de l’interface');
  // Même état renvoyé (son, réglages) : le repli reste, ses animations ne repartent pas de zéro.
  send(loadingState());
  assert.equal(calls.length, 1, 'repli gardé d’un état à l’autre');
  assert.equal(root.firstElementChild, box);
});

test('chargement en borne, réglage de l’affichage : seul l’aide-mémoire du menu de VPX reste', () => {
  const { send, root } = renderer('cab');
  send(loadingState({ video: true, display: true }));
  const keys = [...root.querySelectorAll('.game-keys')];
  assert.equal(keys.length, 1);
  assert.ok(keys[0]!.classList.contains('display-reminder'));
  assert.equal(root.querySelector('h1, .loading-card'), null, 'ni titre ni encart');
  assert.equal(root.textContent!.replace(/\s/g, ''), keys[0]!.textContent!.replace(/\s/g, ''), 'aucun autre texte');
  // Sans média : l'aide-mémoire sous la barre d'attente du repli.
  const other = renderer('cab');
  other.send(loadingState({ display: true }));
  assert.ok(other.root.querySelector('.loading-fallback .cp-ld-slot .display-reminder'));
});

test('chargement au bureau : un encart à droite du cadre, avec le titre, l’état et les commandes', () => {
  const { send, root, calls } = renderer('desktop');
  send(loadingState({ video: true }));
  const cards = root.querySelectorAll('.loading-card');
  assert.equal(cards.length, 1, 'un seul encart');
  const card = cards[0]!;
  assert.equal(card.querySelector('h1.loading-title')!.textContent, 'Neon Galaxy');
  assert.equal(card.querySelector('.loading-meta')!.textContent, 'Williams · 1992');
  assert.match(card.querySelector('.loading-state')!.textContent!, /Chargement de la table/);
  assert.ok(card.querySelector('.loading-state .loading-bar .loading-run'), 'barre d’attente');
  assert.equal(card.querySelectorAll('.game-key').length, GAME_ROWS.length, 'toutes les commandes');
  assert.equal(root.querySelectorAll('.game-keys').length, 1, 'les commandes dans l’encart seulement');
  assert.ok(root.querySelector(':scope > .brand'), 'la marque à sa place');
  assert.equal(root.querySelector('.loading-fallback'), null, 'le média de chargement est dans le cadre (#media-bg)');
  assert.equal(calls.length, 0);
  // Titre long : un corps plus petit.
  send(loadingState({ video: true, title: 'Le très long titre d’une table imaginaire pour vérifier les débordements' }));
  assert.equal(root.querySelector('.loading-title')!.getAttribute('data-size'), 's');
});

test('chargement au bureau sans média : le repli à la place du média, dans le cadre, sans libellé', () => {
  const { send, root, calls } = renderer('desktop');
  send(loadingState());
  const standIn = root.querySelector('.loading-fallback')!;
  assert.ok(standIn.classList.contains('in-frame'), 'repli posé dans le cadre');
  assert.deepEqual(calls.map((c) => c.options.label), [false]);
  assert.equal(standIn.querySelector('.game-keys'), null, 'les commandes restent dans l’encart');
  assert.equal(root.querySelectorAll('.loading-card .game-keys').length, 1);
});

/** Nombre de pixels de référence (petit côté de 1080) d'une propriété d'une règle de frontend.css. */
function cote(css: string, selector: string, prop: string): number {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `règle ${selector}`);
  const block = css.slice(start, css.indexOf('}', start));
  const line = new RegExp(`\\n\\s*${prop}: ([^;]+);`).exec(block);
  assert.ok(line, `${selector} : ${prop}`);
  const value = /([\d.]+) \* var\(--(?:u|px)\)\)?$/.exec(line![1]!.trim());
  assert.ok(value, `${selector} : ${prop} en pixels de référence (${line![1]})`);
  return Number(value![1]);
}

/** Épaisseur du chant dessiné par les ombres d'une règle (la plus grande). */
function chant(css: string, selector: string): number {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  const shadows = /box-shadow:([^;]+);/.exec(block)![1]!;
  return Math.max(...[...shadows.matchAll(/0 0 0 calc\(([\d.]+) \* var\(--(?:u|px)\)\)/g)].map((m) => Number(m[1])));
}

test('chargement au bureau : l’encart a les cotes du cadre du média et ne le recouvre pas', () => {
  const css = fs.readFileSync(path.join(APP, 'renderer', 'frontend.css'), 'utf8').replace(/\r\n/g, '\n');
  const FRAME = 'html.menu-desktop:not(html.in-game):not(html.attract-mode) #media-bg';
  const frame = { left: cote(css, FRAME, 'left'), top: cote(css, FRAME, 'top'), width: cote(css, FRAME, 'width'), height: cote(css, FRAME, 'height'), chant: chant(css, FRAME) };
  const card = { left: cote(css, '.loading-card', 'left'), right: cote(css, '.loading-card', 'right'), top: cote(css, '.loading-card', 'top'), height: cote(css, '.loading-card', 'height'), chant: chant(css, '.loading-card') };
  assert.equal(card.top, frame.top, 'même haut que le cadre');
  assert.equal(card.height, frame.height, 'même hauteur que le cadre');
  assert.equal(card.right, frame.left, 'même marge au bord de l’écran');
  assert.equal(card.chant, frame.chant, 'même chant');
  // De chant à chant, l'écart entre le cadre et l'encart est celui du cadre au bord de l'écran.
  const gap = card.left - card.chant - (frame.left + frame.width + frame.chant);
  assert.equal(gap, frame.left - frame.chant, 'même espacement');
  assert.ok(gap > 0, 'l’encart ne recouvre pas le cadre');
  // Le repli du média de chargement est posé exactement dans le cadre.
  for (const prop of ['left', 'top', 'width', 'height'] as const) assert.equal(cote(css, '.loading-fallback.in-frame', prop), frame[prop], `repli : ${prop}`);
});

test('chargement : le garde-fou de mise en page contrôle les deux compositions dans le rendu réel', () => {
  const guard = fs.readFileSync(path.join(APP, 'src', 'layout-check.ts'), 'utf8');
  assert.match(guard, /loading-phase[\s\S]*menu-cab[\s\S]*texte sur le chargement en borne/);
  assert.match(guard, /encart du chargement sur le cadre du média/);
  assert.match(guard, /repli du média de chargement hors du cadre/);
});
