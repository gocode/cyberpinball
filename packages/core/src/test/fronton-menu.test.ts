// Fronton en fond du menu des tables, au bureau (30/10/2026) : Back to the Future a reçu une vidéo
// (Backglass).mp4 à la place de son image. L'écran du fronton la montrait ; le fond du menu gardait
// l'image d'avant, car il ne chargeait que des images (new Image(), dont onload n'arrive jamais pour
// une vidéo) : l'ancien fronton restait, et celui de la table précédente au changement de table.
// Le fond du menu passe désormais par la couche de media.js, comme chaque écran : image ou vidéo.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { APP, menuRenderer, menuState } from './menu-renderer';

const VIDEO = 'cyber-media://fichier/D%3A%5Ct%5C(Backglass)%20Alpha.mp4?v=1';
const IMAGE = 'cyber-media://fichier/D%3A%5Ct%5C(Backglass)%20Bravo.png?v=1';

const backglass = (url: string | undefined, kind: 'image' | 'video') =>
  url ? { role: 'backglass', type: 'Backglass', source: 'vpx-name', url, kind, fit: 'contain', rotation: 0, card: { title: 'Alpha' } } : undefined;

function renderer(shape: 'desktop' | 'cab') {
  const page = menuRenderer();
  // Pas de lecture de vidéo dans linkedom.
  const Media = Object.getPrototypeOf(page.document.createElement('video'));
  Media.play = () => Promise.resolve();
  Media.pause = () => {};
  Media.load = () => {};
  const html = page.document.documentElement;
  html.classList.toggle('menu-desktop', shape === 'desktop');
  html.classList.toggle('menu-cab', shape === 'cab');
  const layer = () => (page.window.cyberEtat as () => { couches: { role: string; element: string; fichier?: string }[] })().couches.find((c) => c.role === 'fronton-menu');
  const holder = () => page.document.querySelector('.menu-backglass')!;
  return { ...page, layer, holder };
}

test('fronton du menu au bureau : une vidéo (Backglass) se montre, et remplace l’image d’avant', () => {
  const { send, layer, holder } = renderer('desktop');
  const state = menuState({ 'a.vpx': undefined, 'b.vpx': undefined, 'c.vpx': undefined });
  send({ ...state, backglass: backglass(IMAGE, 'image') });
  assert.ok(holder().querySelector('img.media-element'), 'image du fronton');
  assert.equal(layer()?.element, 'image');

  send({ ...state, backglass: backglass(VIDEO, 'video') });
  assert.ok(holder().querySelector('video.media-element'), 'vidéo du fronton, à la place de l’image');
  assert.equal(layer()?.element, 'vidéo');
  assert.equal(layer()?.fichier, '(Backglass) Alpha.mp4');
  assert.equal(holder().querySelector('video')!.getAttribute('style')?.includes('cover'), true, 'en cover, comme l’image avant');

  // Table sans fronton : la place reste sombre, aucun fronton d'une autre table.
  send({ ...state, backglass: undefined });
  assert.equal(layer()?.element, 'vide');
});

test('fronton du menu en borne : zone cachée, rien n’y est chargé', () => {
  const { send, layer, holder } = renderer('cab');
  send({ ...menuState({ 'a.vpx': undefined, 'b.vpx': undefined }), backglass: backglass(VIDEO, 'video') });
  assert.equal(holder().querySelector('video, img'), null);
  assert.equal(layer()?.element, 'vide');
});

test('le rendu du menu ne charge aucun média de table par new Image() : media.js seul sait lire image et vidéo', () => {
  // Le logo de la roue (CyberMedia.logo) est toujours une image ; tout autre média peut être une vidéo.
  const front = fs.readFileSync(path.join(APP, 'renderer', 'frontend.js'), 'utf8');
  assert.doesNotMatch(front, /new Image\(/, 'frontend.js : passer par CyberMedia.layer');
});
