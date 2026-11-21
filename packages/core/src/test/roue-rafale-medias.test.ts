// Rafale d'appuis dans la roue (21/11/2026). Chaque table survolée lançait sa vidéo sur chaque écran
// (plateau 4K, fronton, DMD : un décodeur et un fondu par table) et rejouait l'effet du titre (mise en
// page du titre recalculée pendant tout le défilement). Invariants, dans le vrai rendu :
// - un appui isolé change le média et joue l'effet du titre tout de suite ;
// - pendant une rafale, aucun média de table survolée n'est créé : seul le dernier est posé, après
//   le repos (SETTLE_MS de media.js) ; le titre change sans effet, puis l'effet se joue une fois, sur
//   le dernier titre, quand la roue se pose.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menuRenderer, menuState } from './menu-renderer';

const TABLES = 12;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** État du menu, la table `at` au centre, avec la vidéo (ici une image) du plateau de cette table. */
function stateAt(at: number) {
  const wheels: Record<string, string> = {};
  for (let i = 0; i < TABLES; i++) wheels[`T${i}.vpx`] = `cyber-media://medias/T${i}.png`;
  const base = menuState(wheels);
  const neighbors = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((offset) => {
    const i = (((at + offset) % TABLES) + TABLES) % TABLES;
    return { offset, key: `T${i}.vpx`, title: `T${i}`, wheel: `cyber-media://medias/T${i}.png` };
  });
  const playfield = { role: 'playfield', type: 'PlayField', source: 'table', url: `cyber-media://medias/fond${at}.png`, fit: 'cover', rotation: 0 };
  return { ...base, count: TABLES, position: at + 1, table: { title: `T${at}`, subtitle: '' }, neighbors, medias: { playfield } };
}

/**
 * Fonds du plateau créés, dans l'ordre : chaque image qui reçoit l'adresse d'un fond. Relevé au moment
 * où elle la reçoit : une couche pas encore affichée est retirée dès qu'une autre arrive, la chercher
 * ensuite dans la page ne prouverait rien.
 */
function trackBackgrounds(document: ReturnType<typeof menuRenderer>['document']): () => string[] {
  const created: string[] = [];
  const img = document.createElement('img');
  let proto = Object.getPrototypeOf(img);
  let desc: PropertyDescriptor | undefined;
  for (let p = proto; p && !desc; p = Object.getPrototypeOf(p)) {
    desc = Object.getOwnPropertyDescriptor(p, 'src');
    if (desc) proto = p;
  }
  assert.ok(desc?.set && desc.get, 'propriété src des images');
  Object.defineProperty(proto, 'src', {
    configurable: true,
    get() {
      return desc!.get!.call(this);
    },
    set(v: string) {
      const name = String(v).replace(/^.*\//, '');
      if (name.startsWith('fond')) created.push(name);
      desc!.set!.call(this, v);
    },
  });
  return () => [...created];
}

test('roue en rafale : seul le média de la dernière table est posé, au repos ; un appui isolé le pose tout de suite', async () => {
  const { document, send } = menuRenderer();
  const created = trackBackgrounds(document);
  send(stateAt(0));
  assert.deepEqual(created(), ['fond0.png']);
  await wait(300);
  // Appui isolé : tout de suite.
  send(stateAt(1));
  assert.deepEqual(created(), ['fond0.png', 'fond1.png'], 'appui isolé : le média change sans attendre');
  await wait(300);
  // Rafale : quatre appuis rapprochés (le premier part du repos, il est immédiat).
  send(stateAt(2));
  await wait(40);
  send(stateAt(3));
  await wait(40);
  send(stateAt(4));
  await wait(40);
  send(stateAt(5));
  assert.deepEqual(created(), ['fond0.png', 'fond1.png', 'fond2.png'], 'pendant la rafale, seul le premier appui (parti du repos) a son média');
  await wait(320);
  assert.deepEqual(created(), ['fond0.png', 'fond1.png', 'fond2.png', 'fond5.png'], 'au repos, le média de la dernière table, et lui seul');
});

test('roue en rafale : retour à la table affichée pendant la rafale, rien de plus n’est posé', async () => {
  const { document, send } = menuRenderer();
  const created = trackBackgrounds(document);
  send(stateAt(0));
  await wait(300);
  send(stateAt(1));
  await wait(40);
  send(stateAt(2));
  await wait(40);
  send(stateAt(1));
  await wait(320);
  assert.deepEqual(created(), ['fond0.png', 'fond1.png'], 'la table survolée n’a jamais eu son média');
});

test('lancement d’une partie juste après une rafale : le média de chargement ne fait pas attendre', async () => {
  const { document, send } = menuRenderer();
  const created = trackBackgrounds(document);
  send(stateAt(0));
  await wait(300);
  send(stateAt(1));
  await wait(40);
  send(stateAt(2));
  // Start aussitôt : la vidéo de chargement de la table, sans délai (seul l'écran des tables attend la fin d'une rafale).
  send({ ...stateAt(2), phase: 'loading', loading: { role: 'playfield', type: 'Loading', source: 'table', url: 'cyber-media://medias/fond-chargement.png', fit: 'cover', rotation: 0 } });
  assert.ok(created().includes('fond-chargement.png'), 'chargement : média posé tout de suite');
  await wait(320);
  assert.ok(!created().includes('fond2.png'), 'la table de la rafale n’a pas eu son média par-dessus le chargement');
});

test('roue en rafale : le titre change sans effet, puis l’effet se joue une fois, sur le dernier titre, à l’arrêt', async () => {
  const { document, send } = menuRenderer();
  send(stateAt(0));
  const title = document.querySelector('.menu .title') as unknown as { animate?: unknown; textContent: string | null };
  assert.ok(title, 'titre de la table');
  const played: string[] = [];
  // Un effet = l'animation d'opacité (le flou, animé à part, l'accompagne : animations-legeres.test.ts).
  title.animate = (frames: { opacity?: number }[]) => {
    if (frames[0]?.opacity !== undefined) played.push(title.textContent ?? '');
    return { cancel() {}, finish() {} };
  };
  // La roue se pose après le premier état.
  await wait(500);
  send(stateAt(1));
  assert.deepEqual(played, ['T1'], 'appui isolé : effet tout de suite');
  await wait(500);
  send(stateAt(2));
  await wait(60);
  send(stateAt(3));
  await wait(60);
  send(stateAt(4));
  assert.equal(title.textContent, 'T4', 'le texte suit chaque appui');
  assert.deepEqual(played, ['T1', 'T2'], 'pendant la rafale, seul le premier appui (parti du repos) a son effet');
  await wait(500);
  assert.deepEqual(played, ['T1', 'T2', 'T4'], 'à l’arrêt, l’effet se joue une fois, sur le dernier titre');
});
