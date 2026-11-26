// Root Access : l'affichage propre au jeu (DMD, fronton), la musique de fond et le branchement dans la borne.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { parseRootAccessStatus, rootAccessAnimation, rootAccessDots, sameRootAccessCard, type RootAccessStatus } from '../root-access-dmd';
import { REPO_ROOT } from './i18n-scan';

const GAME_DIR = path.join(REPO_ROOT, 'app', 'renderer', 'root-access');
const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
const lit = (dots: Uint8Array) => dots.reduce((n, d) => n + (d > 0 ? 1 : 0), 0);

const jeu: RootAccessStatus = { screen: 'jeu', floor: 3, floors: 6, name: 'LE TRONC', score: 12500 };

test('statut du jeu : vérifié et borné, refusé s\'il est incomplet', () => {
  assert.deepEqual(parseRootAccessStatus({ screen: 'jeu', floor: 3, floors: 6, name: 'LE TRONC', score: 12500 }), jeu);
  assert.equal(parseRootAccessStatus(undefined), undefined);
  assert.equal(parseRootAccessStatus('jeu'), undefined);
  assert.equal(parseRootAccessStatus({ screen: 'autre', floor: 1, floors: 6, name: '', score: 0 }), undefined);
  assert.equal(parseRootAccessStatus({ screen: 'jeu', floor: 'x', floors: 6, name: '', score: 0 }), undefined);
  assert.equal(parseRootAccessStatus({ screen: 'jeu', floor: 1, floors: 6, name: '', score: Number.NaN }), undefined);
  const borne = parseRootAccessStatus({ screen: 'jeu', floor: 40, floors: 6, name: 'x'.repeat(500), score: -5 })!;
  assert.equal(borne.floor, 6, 'jamais au-delà du dernier étage');
  assert.equal(borne.score, 0);
  assert.equal(borne.name.length, 40);
});

test('fronton : le score ne change pas la carte, l\'étage ou l\'écran oui', () => {
  assert.ok(sameRootAccessCard(jeu, { ...jeu, score: 99 }));
  assert.ok(!sameRootAccessCard(jeu, { ...jeu, floor: 2 }));
  assert.ok(!sameRootAccessCard(jeu, { ...jeu, screen: 'dead' }));
  assert.ok(!sameRootAccessCard(jeu, undefined));
  assert.ok(sameRootAccessCard(undefined, undefined));
});

test('DMD : titre qui clignote, étage et score en jeu, écrans de fin', () => {
  const titre = rootAccessDots(undefined, 0);
  assert.ok(lit(titre) > 0);
  assert.notDeepEqual(titre, rootAccessDots(undefined, 700), 'la consigne clignote');
  const a = rootAccessDots(jeu);
  assert.ok(lit(a) > 0);
  assert.notDeepEqual(a, rootAccessDots({ ...jeu, score: 13000 }), 'le score se voit');
  assert.notDeepEqual(a, rootAccessDots({ ...jeu, floor: 4 }), 'l\'étage se voit');
  const perdue = rootAccessDots({ ...jeu, screen: 'dead' });
  const gagnee = rootAccessDots({ ...jeu, screen: 'won' });
  assert.ok(lit(perdue) > 0 && lit(gagnee) > 0);
  assert.notDeepEqual(perdue, gagnee);
});

test('DMD : l\'animation relit le statut à chaque image', () => {
  let status: RootAccessStatus | undefined = jeu;
  const anim = rootAccessAnimation(() => status);
  assert.equal(anim.duration, undefined, 'en boucle');
  const avant = anim.dots(0);
  status = { ...jeu, score: 99999 };
  assert.notDeepEqual(avant, anim.dots(40));
});

test('musique de fond : discrète, en boucle, coupée en essai hors écran', () => {
  const mp3 = path.join(GAME_DIR, 'musique.mp3');
  assert.ok(fs.existsSync(mp3) && fs.statSync(mp3).size > 100_000, 'musique.mp3 présent');
  const game = read('app', 'renderer', 'root-access', 'game.js');
  assert.match(game, /new Audio\('musique\.mp3'\)/);
  assert.match(game, /\.loop = true/);
  const volume = /MUSIC_VOLUME = ([0-9.]+)/.exec(game);
  assert.ok(volume && Number(volume[1]) > 0 && Number(volume[1]) <= 0.2, 'volume de fond');
  assert.match(game, /get\('musique'\) === '0'/);
  const main = read('app', 'src', 'root-access.ts');
  assert.match(main, /musique: OFFSCREEN \? '0' : '1'/);
});

test('branchement : plus de PuP-Pack ni de vidéo pendant le jeu, DMD et fronton à lui', () => {
  const fe = read('app', 'src', 'frontend.ts');
  // Les médias et la musique de la table se coupent tant que le jeu est ouvert.
  assert.match(fe, /function screensSubject\(\)[\s\S]{0,400}rootAccess\.isOpen\(\)/);
  assert.match(fe, /rootAccessAnimation\(/);
  assert.match(fe, /rootAccess: rootAccess\.isOpen\(\) \? rootAccessCard\(\) : undefined/);
  const preload = read('app', 'src', 'root-access-preload.ts');
  assert.match(preload, /statut:/);
  assert.match(preload, /'root-access:status'/);
  const html = read('app', 'renderer', 'frontend.html');
  assert.ok(html.includes('root-access-ecran.js') && html.includes('root-access-ecran.css'));
  const front = read('app', 'renderer', 'frontend.js');
  assert.match(front, /CyberRootAccess\?\.zone\(/);
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'app', 'renderer', 'root-access-ecran.js')));
});
