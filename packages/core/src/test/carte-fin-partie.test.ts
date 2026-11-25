// Carte de fin de partie (décidée le 25/11/2026) : à la fin d'une partie solo lue en
// direct, par-dessus VPX, le score, le top 3 du pays avec la ligne du joueur en 4e, sa place au
// monde ; flip gauche : défier, flip droit : continuer. Invariants : la carte ne vient que d'une
// partie finie du relevé en direct ; elle ne prend jamais le focus ; elle attend que les flippers
// et Start se taisent (initiales) et ne compte qu'un appui fait après son apparition.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  END_CARD_ARM_MS,
  END_CARD_QUIET_MS,
  EndCardKeys,
  emptyRankings,
  endCardBounds,
  endCardRows,
  endCardView,
  type EndCardButtons,
  type RankedScore,
  type RankingStore,
} from '../index';

const BOARD = 'v1:abcdef';
const TABLE = { title: 'Copper Comet' };
const ME = 'cle-moi';

function score(key: string, name: string, country: string | undefined, value: number, board = BOARD): RankedScore {
  return { key, name, ...(country ? { country } : {}), board, balls: 3, table: TABLE, score: value, at: '2026-11-20T10:00:00.000Z', how: 'rom', sig: '' };
}

function store(scores: RankedScore[]): RankingStore {
  return { ...emptyRankings(), scores };
}

const others = [
  score('a', 'Alice', 'FR', 9_000_000),
  score('b', 'Bruno', 'FR', 8_000_000),
  score('c', 'Chloé', 'FR', 7_000_000),
  score('d', 'Dario', 'FR', 6_000_000),
  score('e', 'Emma', 'BE', 20_000_000),
  score('f', 'Finn', 'DE', 15_000_000),
];

const input = (value: number, scores: RankedScore[], country: string | null = 'FR') => ({
  table: TABLE,
  score: value,
  at: '2026-11-25T20:00:00.000Z',
  locale: 'fr-FR',
  ranking: { store: store(scores), board: BOARD, balls: 3, me: { key: ME, name: 'Moi', ...(country ? { country } : {}) } },
});

test('hors du top 3 du pays : les trois premiers, puis ma ligne en 4e avec ma place ; ma place au monde', () => {
  const view = endCardView(input(5_000_000, others));
  assert.equal(view.board?.lines.length, 4);
  assert.deepEqual(view.board?.lines.map((l) => l.name), ['Alice', 'Bruno', 'Chloé', 'Moi']);
  assert.equal(view.board?.lines[3]?.mine, true);
  assert.match(view.board?.lines[3]?.rank ?? '', /5/);
  // Un vrai drapeau, jamais deux lettres.
  assert.ok(view.board?.flag?.src?.endsWith('fr.svg'));
  assert.ok(view.board?.lines.every((l) => l.flag.src));
  // Monde : Emma, Finn, Alice, Bruno, Chloé, Dario devant ; 7 joueurs.
  assert.ok(view.world);
  assert.match(view.world!.value, /7/);
  assert.equal(view.off, undefined);
});

test('dans le top 3 : trois lignes, dont la mienne', () => {
  const view = endCardView(input(8_500_000, others));
  assert.deepEqual(view.board?.lines.map((l) => l.name), ['Alice', 'Moi', 'Bruno']);
  assert.equal(view.board?.lines.filter((l) => l.mine).length, 1);
});

test('le score de la partie compte avant sa publication ; record seulement s’il bat mon meilleur', () => {
  const mine = score(ME, 'Moi', 'FR', 4_000_000);
  const better = endCardView(input(5_000_000, [...others, mine]));
  assert.equal(better.record, true);
  assert.equal(better.board?.lines.find((l) => l.mine)?.score.replace(/\D/g, ''), '5000000');
  const worse = endCardView(input(3_000_000, [...others, mine]));
  assert.equal(worse.record, false);
  // Ma ligne garde mon meilleur score.
  assert.equal(worse.board?.lines.find((l) => l.mine)?.score.replace(/\D/g, ''), '4000000');
  // Premier score sur cette version : pas de record annoncé.
  assert.equal(endCardView(input(5_000_000, others)).record, false);
  // Une autre version de la table ne compte pas.
  const elsewhere = score(ME, 'Moi', 'FR', 1_000, 'v1:autre');
  assert.equal(endCardView(input(5_000_000, [...others, elsewhere])).record, false);
});

test('sans pays choisi : le top 3 du monde, sans ligne « Monde » à part', () => {
  const view = endCardView(input(5_000_000, others, null));
  assert.equal(view.world, undefined);
  assert.deepEqual(view.board?.lines.slice(0, 3).map((l) => l.name), ['Emma', 'Finn', 'Alice']);
  assert.equal(view.board?.lines[3]?.mine, true);
});

test('classement indisponible : la raison reste à l’écran, et le défi grisé dit pourquoi', () => {
  const view = endCardView({ table: TABLE, score: 1234, at: '2026-11-25T20:00:00.000Z', locale: 'fr-FR', ranking: { unavailable: 'Partage désactivé' }, challengeOff: 'Défis fermés' });
  assert.equal(view.board, undefined);
  assert.equal(view.off, 'Partage désactivé');
  assert.equal(view.left.off, 'Défis fermés');
  assert.ok(view.left.label && view.right.label && view.left.hint && view.right.hint);
  // La raison peut tenir sur deux lignes ; celle du défi, différente, prend une ligne de plus.
  assert.equal(endCardRows(view), 3);
  // Même raison pour le défi : elle ne se répète pas, pas de ligne en plus.
  const same = endCardView({ table: TABLE, score: 1234, at: '2026-11-25T20:00:00.000Z', locale: 'fr-FR', ranking: { unavailable: 'Partage désactivé' }, challengeOff: 'Partage désactivé' });
  assert.equal(endCardRows(same), 2);
});

test('place : centrée en largeur, dans le tiers haut du plateau, toujours dans la zone', () => {
  const zone = { x: 1920, y: 0, width: 1080, height: 1920 };
  const b = endCardBounds(zone, 0, 6);
  assert.equal(b.x - zone.x, zone.width - (b.x - zone.x) - b.width);
  assert.ok(Math.abs(b.y + b.height / 2 - zone.height / 3) <= 1);
  const lying = { x: 0, y: 0, width: 1920, height: 1080 };
  for (const rotation of [0, 90, 180, 270] as const) {
    const r = endCardBounds(lying, rotation, 6);
    assert.ok(r.x >= lying.x && r.y >= lying.y && r.x + r.width <= lying.x + lying.width && r.y + r.height <= lying.y + lying.height, `rotation ${rotation}`);
  }
});

const none: EndCardButtons = { left: false, right: false, start: false };

test('boutons : la carte attend le silence des flippers et de Start (initiales), puis un appui neuf', () => {
  const keys = new EndCardKeys(0);
  // Saisie des initiales : des appuis réguliers repoussent la carte.
  assert.equal(keys.feed(1000, { ...none, left: true }), undefined);
  assert.equal(keys.feed(3000, { ...none, start: true }), undefined);
  assert.equal(keys.feed(3000 + END_CARD_QUIET_MS - 1, none), undefined);
  assert.equal(keys.feed(3000 + END_CARD_QUIET_MS, none), 'show');
  const shown = 3000 + END_CARD_QUIET_MS;
  // Un appui trop tôt ne compte pas, et s'il est tenu, il ne compte pas non plus ensuite.
  assert.equal(keys.feed(shown + 100, { ...none, left: true }), undefined);
  assert.equal(keys.feed(shown + END_CARD_ARM_MS + 50, { ...none, left: true }), undefined);
  assert.equal(keys.feed(shown + END_CARD_ARM_MS + 100, none), undefined);
  assert.equal(keys.feed(shown + END_CARD_ARM_MS + 150, { ...none, right: true }), 'right');
  // Une fois réglée, plus rien.
  assert.equal(keys.feed(shown + 5000, { ...none, left: true }), undefined);
  assert.equal(keys.state, 'done');
});

test('boutons : flip gauche après l’armement, défier ; fermée avant (nouvelle partie), jamais montrée', () => {
  const keys = new EndCardKeys(0);
  assert.equal(keys.feed(END_CARD_QUIET_MS, none), 'show');
  assert.equal(keys.feed(END_CARD_QUIET_MS + END_CARD_ARM_MS, { ...none, left: true }), 'left');
  const closed = new EndCardKeys(0);
  closed.close();
  assert.equal(closed.feed(END_CARD_QUIET_MS * 2, none), undefined);
});

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');

test('la carte ne vient que d’une partie finie du relevé en direct', () => {
  const front = read('app', 'src', 'frontend.ts');
  const calls = front.split('endCard.gameOver(').length - 1;
  assert.equal(calls, 1, 'un seul déclencheur');
  assert.equal(front.split('endCardAfterGame(').length - 1, 2, 'une définition, un appel');
  const at = front.indexOf('endCardAfterGame(');
  const before = front.slice(front.lastIndexOf('watchSoloScores(', at), at);
  assert.match(before, /onGame: \(g, finished\) =>/);
  assert.match(before, /if \(finished\) $/);
  // Une seule partie solo, un vrai score.
  const helper = front.slice(front.indexOf('function endCardAfterGame('), front.indexOf('endCard.gameOver('));
  assert.match(helper, /if \(scores\.length !== 1 \|\| !score\) return;/);
  // Une nouvelle partie, ou VPX quitté, l'emporte.
  assert.match(front, /onPlay: \(\) => endCard\.close\(\)/);
  assert.match(front, /const result = await game\.done;[\s\S]{0,400}?gameNotices\.close\(\);[\s\S]{0,300}?endCard\.close\(\);/);
  assert.match(read('app', 'src', 'solo-score-watch.ts'), /if \(nowPlaying && !playing\) opts\.onPlay\?\.\(\)/);
});

test('la carte ne prend jamais le focus : fenêtre des notifications de partie, montrée sans activation', () => {
  const src = read('app', 'src', 'carte-fin-partie.ts');
  assert.match(src, /overlay\(/);
  assert.doesNotMatch(src, /\.focus\(|\.show\(\)|focusable: true|setIgnoreMouseEvents\(false/);
  const notice = read('app', 'src', 'game-notice.ts');
  assert.match(notice, /focusable: false/);
  assert.match(notice, /showInactive\(\)/);
  // Les flips se lisent sans focus : clavier par Windows, joystick par SDL.
  assert.match(src, /keysDown\(/);
  assert.match(src, /joystickButtonsHeld\(\)/);
});
