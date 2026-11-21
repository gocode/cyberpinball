// Fluidité de l'écran des tables relevée sur chaque borne (21/11/2026) : les mesures de la roue venaient
// d'un PC de développement. Invariants : rien n'est relevé au repos ; pendant le défilement, chaque image
// est comptée (lentes au-delà de 25 ms, la plus longue, le rythme habituel) ; un résumé part au plus
// une fois par minute, et en quittant l'écran des tables ; le journal en fait une ligne lisible, et
// ignore un relevé vide ou illisible (il vient d'une page).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const { screenPaceLine } = require(path.join(REPO_ROOT, 'app', 'dist', 'screen-pace.js')) as { screenPaceLine(raw: unknown): string | undefined };

interface Sent {
  frames: number;
  slow: number;
  worst: number;
  usual: number;
  width: number;
  height: number;
}

/** cadence-ecran.js dans un contexte à horloge et images tenues par l'essai. */
function page() {
  let now = 0;
  const pending: ((t: number) => void)[] = [];
  const sent: Sent[] = [];
  const ctx: Record<string, unknown> = {
    performance: { now: () => now },
    requestAnimationFrame: (f: (t: number) => void) => (pending.push(f), pending.length),
    document: { hidden: false },
    innerWidth: 1440,
    innerHeight: 2560,
    devicePixelRatio: 1.5,
    cyber: { screenPace: (p: Sent) => sent.push(p) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'cadence-ecran.js'), 'utf8'), ctx);
  const api = ctx.CyberCadence as { watch(): void; flush(): void };
  /** Une image, `ms` après la précédente ; faux s'il n'y en avait aucune de demandée. */
  const frame = (ms: number) => {
    now += ms;
    const f = pending.shift();
    f?.(now);
    return Boolean(f);
  };
  return { api, frame, sent, pending, advance: (ms: number) => (now += ms) };
}

test('fluidité de l’écran des tables : relevée pendant le défilement seulement, un résumé par minute au plus', () => {
  const p = page();
  assert.equal(p.pending.length, 0, 'au repos, aucune image demandée');
  p.api.watch();
  // Défilement à 60 Hz, dont trois images lentes (une de 94 ms).
  p.frame(16.7);
  for (let i = 0; i < 80; i++) p.frame(i === 10 ? 94 : i === 20 || i === 30 ? 33.4 : 16.7);
  while (p.frame(16.7));
  assert.equal(p.pending.length, 0, 'le relevé s’arrête seul après le défilement');
  assert.equal(p.sent.length, 0, 'pas encore de résumé : moins d’une minute');
  // Plus d'une minute plus tard, nouvel appui : le résumé part à la fin de ce relevé.
  p.advance(61_000);
  p.api.watch();
  p.frame(16.7);
  while (p.frame(16.7));
  assert.equal(p.sent.length, 1);
  const s = p.sent[0]!;
  assert.equal(s.slow, 3);
  assert.equal(s.worst, 94);
  assert.equal(s.usual, 16.7);
  assert.equal(s.width, 2160);
  assert.equal(s.height, 3840);
  assert.ok(s.frames > 150, `${s.frames} images`);
  // Écran quitté : ce qui reste part tout de suite ; rien à envoyer ensuite.
  p.api.watch();
  p.frame(16.7);
  while (p.frame(16.7));
  p.api.flush();
  assert.equal(p.sent.length, 2);
  p.api.flush();
  assert.equal(p.sent.length, 2, 'rien de neuf, rien d’envoyé');
});

test('fluidité de l’écran des tables : une ligne de journal lisible, rien pour un relevé vide ou illisible', () => {
  const line = screenPaceLine({ frames: 1820, slow: 14, worst: 94, seconds: 31.2, usual: 16.7, width: 2160, height: 3840 });
  // Séparateur des milliers en français : celui de toLocaleString (espace fine insécable).
  const thousands = (1820).toLocaleString('fr-FR');
  assert.equal(line, `Fluidité de l'écran des tables : ${thousands} images en 31,2 s de défilement, 14 lentes (plus de 25 ms, 0,8 %), la plus longue 94 ms ; rythme habituel 16,7 ms (60 Hz) ; plateau 2160 × 3840.`);
  assert.equal(screenPaceLine({ frames: 0 }), undefined);
  assert.equal(screenPaceLine('n’importe quoi'), undefined);
  assert.equal(screenPaceLine(null), undefined);
  assert.match(screenPaceLine({ frames: 10, slow: 99, worst: -5, seconds: 'x' })!, /10 images en 0 s de défilement, 10 lentes .* la plus longue 0 ms/);
});
