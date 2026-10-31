// L'écran de score du DMD (essai réel du 31/10/2026 : les scores des amis posés « par moment »
// sur le DMD gênaient le jeu ; ils ne doivent s'y poser que quand il affiche des scores, jamais
// pendant une animation, un mode, ni la saisie des initiales ou la fin de la partie).
// La règle (dmdscore.ts) sur des séquences dessinées ici, puis sur de vraies images : celles des
// ROM de la borne, Terminator 2 (WPC) et Star Trek (Stern SAM), jouées hors écran par la libpinmame
// (docs\recherche\dmd-ecran-de-score : documents de travail, jamais publiés ; ces cas sont sautés
// sans eux).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { DMD_SCORE_RULE, DmdScoreWatch, chooseDmdDisplay, type DmdFrame } from '../dmdscore';
import { LiveBoardFlash, type LiveBoardView } from '../gamenotice';

const W = 128;
const H = 32;

/** Une image : des points allumés tirés d'une graine (deux graines, deux images bien différentes). */
function frame(seed: number, lit = 400): DmdFrame {
  const dots = new Uint8Array(W * H);
  let x = seed * 2654435761;
  for (let i = 0; i < lit; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    dots[x % (W * H)] = 255;
  }
  return { width: W, height: H, dots };
}

/** Rejoue des images toutes les 100 ms (`at` en ms) ; rend le verdict à chaque instant demandé. */
function play(watch: DmdScoreWatch, from: number, to: number, image: (t: number) => DmdFrame): void {
  for (let t = from; t < to; t += 100) watch.frame(image(t), t);
}

test('écran de score : l’image qui revient, score immobile, en partie', () => {
  const watch = new DmdScoreWatch();
  watch.game({ inGame: true, score: 154_140 }, 0);
  // Comme Terminator 2 : l'écran de score 1 s, son score qui glisse 0,5 s (images toutes différentes), et ainsi de suite.
  const score = frame(1);
  const t2 = (t: number) => (t % 1500 < 1000 ? score : frame(1000 + t));
  play(watch, 0, 6000, t2);
  assert.equal(watch.verdict(5950).scoreScreen, true, JSON.stringify(watch.verdict(5950)));
  // Pendant le glissement (une transition brève), il reste l'écran de score.
  play(watch, 6000, 6150, t2);
  assert.equal(watch.verdict(6150).scoreScreen, true, 'transition brève');
  // Un BONUS fixe une seconde : plus l'écran de score dès qu'il dure (200 ms).
  const bonus = frame(77);
  play(watch, 6200, 7200, () => bonus);
  assert.equal(watch.verdict(6200 + DMD_SCORE_RULE.strangerMs - 50).scoreScreen, true, 'pas encore');
  assert.equal(watch.verdict(6200 + DMD_SCORE_RULE.strangerMs + 50).why, 'autre image');
});

test('pas d’écran de score : animation, texte montré une fois, score qui bouge, fin de partie', () => {
  // Une animation : chaque image est nouvelle.
  const anim = new DmdScoreWatch();
  anim.game({ inGame: true, score: 10 }, 0);
  play(anim, 0, 6000, (t) => frame(5000 + t));
  assert.equal(anim.verdict(5950).why, 'animation');
  // Un texte de mode, fixe, montré une seule fois après une animation.
  const mode = new DmdScoreWatch();
  mode.game({ inGame: true, score: 10 }, 0);
  const text = frame(9);
  play(mode, 0, 6000, (t) => (t < 3500 ? frame(8000 + t) : text));
  assert.equal(mode.verdict(5950).scoreScreen, false, JSON.stringify(mode.verdict(5950)));
  // L'écran de score, mais le score bouge : la bille est en jeu, rien ne se pose.
  const busy = new DmdScoreWatch();
  const still = frame(3);
  for (let t = 0; t < 6000; t += 100) {
    busy.game({ inGame: true, score: 1000 + Math.floor(t / 1000) * 10 }, t);
    busy.frame(still, t);
  }
  assert.equal(busy.verdict(5950).why, 'score qui bouge');
  // La fin de partie, les initiales : le relevé dit qu'aucune partie n'est en cours.
  const over = new DmdScoreWatch();
  over.game({ inGame: false, score: 535_610 }, 0);
  play(over, 0, 6000, () => still);
  assert.equal(over.verdict(5950).why, 'pas de partie en cours');
  // Trop peu d'images (le flux vient de s'ouvrir) : on attend.
  const fresh = new DmdScoreWatch();
  fresh.game({ inGame: true, score: 1 }, 0);
  fresh.frame(still, 5000);
  assert.equal(fresh.verdict(5100).why, 'pas assez d’images du DMD');
});

test('un DMD à nuances : les ombres ne comptent pas, quelques points qui clignotent non plus', () => {
  const watch = new DmdScoreWatch();
  watch.game({ inGame: true, score: 1 }, 0);
  // Comme Star Trek : une scène en demi-teinte, le score au plein éclat, une étoile qui clignote.
  const scene = (t: number) => {
    const f = frame(4, 300);
    for (let i = 0; i < f.dots.length; i += 3) if (!f.dots[i]) f.dots[i] = 40;
    if (Math.floor(t / 300) % 2) f.dots[5] = 255;
    return f;
  };
  play(watch, 0, 6000, scene);
  assert.equal(watch.verdict(5950).scoreScreen, true, JSON.stringify(watch.verdict(5950)));
});

test('l’afficheur du DMD dans l’arbre de l’inspector : le plus grand, pas un afficheur à segments', () => {
  const tree = [
    { name: 'B2S', children: [{ type: 'category', name: 'Displays', children: [{ type: 'display', name: 'Display 1 64x16', mapping: 11 }] }] },
    {
      name: 'PinMAME',
      game: 't2_l8',
      children: [
        { type: 'category', name: 'Displays', children: [{ type: 'display', name: 'Display 0 128x32', mapping: 42 }] },
        { type: 'category', name: 'Segment Displays', children: [{ type: 'seg_display', name: 'Seg Display 0', mapping: 7 }] },
      ],
    },
  ];
  assert.deepEqual(chooseDmdDisplay(tree), { mapping: '42', name: 'Display 0 128x32', width: 128, height: 32, controller: 'PinMAME' });
  assert.equal(chooseDmdDisplay([{ name: 'X', children: [{ type: 'category', children: [{ type: 'seg_display', name: 'Seg Display 0', mapping: 1 }] }] }]), undefined);
  assert.equal(chooseDmdDisplay('pas un arbre'), undefined);
});

// ---------------------------------------------------------------------------
// Vraies images des ROM de la borne (banc libpinmame du 31/10/2026, tmp\banc-dmd) : chaque image
// qui change, en bits, avec ce que le relevé dirait (partie en cours, score du joueur).

interface Recorded {
  width: number;
  height: number;
  samples: { t: number; inGame: boolean; score: number | null; ball: number | null; frame: string }[];
}

const FIXTURES = path.join(REPO_ROOT, 'docs', 'recherche', 'dmd-ecran-de-score');

/**
 * Rejoue un enregistrement toutes les 50 ms : le verdict aux instants demandés (en s), et les
 * instants où la cadence de la bande (LiveBoardFlash) poserait les scores sur le DMD.
 */
function replay(file: string, times: number[]): { seen: Map<number, string>; flashes: number[] } {
  const rec = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8')) as Recorded;
  const watch = new DmdScoreWatch();
  const seen = new Map<number, string>();
  // Le joueur de la borne, sa bille : une nouvelle bille fait revenir les scores au repos suivant.
  const view = (ball: number): LiveBoardView => ({ mode: 'board', title: 'Partie entre amis', rows: [{ name: 'Alexis', score: '', detail: '', short: '', ball, done: false, me: true, lead: false }] });
  const flash = new LiveBoardFlash(rec.samples[0]!.t * 1000);
  const flashes: number[] = [];
  const asked = [...times].sort((a, b) => a - b);
  rec.samples.forEach((s, k) => {
    const raw = Buffer.from(s.frame, 'base64');
    const bits = new Uint32Array(raw.length / 4).map((_, i) => raw.readUInt32LE(i * 4));
    const dots = new Uint8Array(rec.width * rec.height);
    for (let i = 0; i < dots.length; i++) if (bits[i >>> 5]! & (1 << (i & 31))) dots[i] = 255;
    watch.game({ inGame: s.inGame, ...(s.score !== null ? { score: s.score } : {}) }, s.t * 1000);
    watch.frame({ width: rec.width, height: rec.height, dots }, s.t * 1000);
    const end = rec.samples[k + 1]?.t ?? s.t + 5;
    for (let t = s.t; t < end; t += 0.05) {
      const v = watch.verdict(t * 1000);
      while (asked.length && asked[0]! <= t) seen.set(asked.shift()!, v.why);
      if (flash.visible(view(s.ball ?? 0), t * 1000, v.scoreScreen)) flashes.push(Math.round(t * 100) / 100);
    }
  });
  return { seen, flashes };
}

test('Terminator 2 (WPC) : l’écran de score entre deux coups, jamais le BONUS, le départ ni la fin', { skip: !fs.existsSync(path.join(FIXTURES, 't2_l8.json')) && 'images de travail absentes (dépôt public)' }, () => {
  const { seen, flashes } = replay('t2_l8.json', [27, 29.5, 31.3, 36, 44, 62, 72, 80, 90]);
  // Score immobile, l'écran de score (« 154,140 », BALL 1, CREDITS) entre deux glissements de son score.
  for (const t of [27, 29.5, 44, 62]) assert.equal(seen.get(t), 'écran de score', `${t} s`);
  // « BONUS 150,000 » (30,75 s) : une autre image.
  assert.notEqual(seen.get(31.3), 'écran de score', '31,3 s : BONUS');
  // Départ de la bille 2 (le score clignote) : pas encore.
  assert.notEqual(seen.get(36), 'écran de score', '36 s : départ de bille');
  // Partie finie (game_over avant les initiales), saisie des initiales, attente.
  for (const t of [72, 80, 90]) assert.equal(seen.get(t), 'pas de partie en cours', `${t} s`);
  // Les scores des amis se posent à chaque repos, jamais sur le BONUS ni après la fin.
  assert.ok(flashes.some((t) => t > 25 && t < 30.7) && flashes.some((t) => t > 42 && t < 48.4) && flashes.some((t) => t > 60 && t < 66), `aux trois repos : ${flashes[0]} … ${flashes.at(-1)} (${flashes.length})`);
  // Le BONUS commence à 30,75 s : les scores partent dès qu'il dure (DMD_SCORE_RULE.strangerMs), au plus 0,25 s après.
  assert.deepEqual(flashes.filter((t) => (t >= 31 && t < 33) || t >= 69.5), [], 'ni BONUS ni fin de partie');
});

// Star Trek : en jeu, une scène animée (l'Enterprise, les étoiles) et le score en haut à gauche ; elle
// n'est reconnue qu'à ses moments calmes (prudent : dans le doute, rien sur le DMD).
test('Star Trek (Stern SAM) : la scène en jeu, à ses moments calmes ; jamais une animation ni la fin', { skip: !fs.existsSync(path.join(FIXTURES, 'st_161h.json')) && 'images de travail absentes (dépôt public)' }, () => {
  const { seen, flashes } = replay('st_161h.json', [106.9, 168, 172.5, 92, 112, 150, 186]);
  // L'écran en jeu : l'Enterprise, le score en haut à gauche.
  for (const t of [106.9, 168, 172.5]) assert.equal(seen.get(t), 'écran de score', `${t} s`);
  // Distorsion, récompense (« MEDAL BOUND »), score qui bouge.
  for (const t of [92, 112, 150]) assert.notEqual(seen.get(t), 'écran de score', `${t} s`);
  assert.equal(seen.get(186), 'pas de partie en cours');
  // Une seconde d'une animation inversée (90,5 à 91,5 s) passe pour l'écran de score : le délai d'entrée l'écarte.
  assert.ok(flashes.some((t) => t > 166 && t < 170), 'la scène calme de la fin');
  assert.deepEqual(flashes.filter((t) => t >= 88 && t < 95), [], 'jamais sur l’animation inversée');
});
