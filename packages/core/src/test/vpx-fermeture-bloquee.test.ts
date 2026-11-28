// VPX qui ne se ferme pas (PinCab, 28/11/2026, Back to the Future, trois sorties sur cinq) : Exit tenu
// quelques secondes, VPX écrit « Closing player… » puis « PUP Manager stop » et plus rien. Écran figé,
// son de la bille en boucle, front-end qui attend toujours la fin du processus.
// Invariants : une fermeture qui dure plus de VPX_SHUTDOWN_KILL_MS est coupée par Cyber Pinball, jamais
// avant ; une fenêtre qui revient remet le compte à zéro ; le « Closing player » d'une partie précédente
// (journal cumulatif) ne compte pas ; le launcher branche ce guet et lit le journal par la fin seulement.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { vpxClosingLogged, vpxLogLineTime, vpxStuckInPup, VPX_SHUTDOWN_KILL_MS, watchVpxShutdown } from '../index';

const local = (h: number, m: number, s: number) => new Date(2026, 10, 28, h, m, s, 0).getTime();

// Fin du journal du PinCab (28/11/2026 01:34), abrégée.
const BLOQUE = [
  '2026-11-28 01:30:12.100 INFO  Game started',
  '2026-11-28 01:34:54.694 INFO  Closing player...',
  '2026-11-28 01:34:54.700 INFO  PUP Manager stop',
].join('\n');

test("l'heure d'une ligne du journal de VPX se lit, sinon elle est ignorée", () => {
  assert.equal(vpxLogLineTime('2026-11-28 01:34:54.694 INFO Closing player...'), new Date(2026, 10, 28, 1, 34, 54, 694).getTime());
  assert.equal(vpxLogLineTime('Closing player...'), undefined);
});

test('« Closing player » compte depuis le lancement, pas celui d\'une partie précédente', () => {
  assert.equal(vpxClosingLogged(BLOQUE, local(1, 30, 0)), true);
  // Lancé après la fermeture du journal : c'est une partie d'avant.
  assert.equal(vpxClosingLogged(BLOQUE, local(2, 0, 0)), false);
  assert.equal(vpxClosingLogged('2026-11-28 01:30:12.100 INFO Game started', local(1, 0, 0)), false);
});

test('VPX arrêté dans le PuP-Pack se reconnaît à la dernière ligne utile du journal', () => {
  assert.equal(vpxStuckInPup(BLOQUE), true);
  assert.equal(vpxStuckInPup(`${BLOQUE}\n2026-11-28 01:34:55.000 INFO Unloading plugins\n\n`), false);
  assert.equal(vpxStuckInPup(''), false);
});

test('la fermeture n\'est coupée qu\'après la limite, et le compte repart si la fenêtre revient', () => {
  let w = watchVpxShutdown(undefined, false, 1000);
  assert.deepEqual(w, { since: undefined, kill: false });
  w = watchVpxShutdown(w.since, true, 2000);
  assert.deepEqual(w, { since: 2000, kill: false });
  w = watchVpxShutdown(w.since, true, 2000 + VPX_SHUTDOWN_KILL_MS);
  assert.equal(w.kill, false);
  w = watchVpxShutdown(w.since, true, 2001 + VPX_SHUTDOWN_KILL_MS);
  assert.equal(w.kill, true);
  // La fenêtre est revenue (menu, pause) : plus de fermeture en cours.
  w = watchVpxShutdown(w.since, false, 20_000);
  assert.deepEqual(w, { since: undefined, kill: false });
});

test('le launcher ferme VPX bloqué à la fermeture, avec une notice, et lit le journal par la fin', () => {
  const launcher = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'launcher.ts'), 'utf8');
  assert.match(launcher, /watchVpxShutdown\(shutdownSince, ending, Date\.now\(\)\)/);
  assert.match(launcher, /if \(watch\.kill\) \{[\s\S]*?notices\.push\([\s\S]*?child\.kill\(\)/);
  assert.match(launcher, /vpxClosingLogged\(readLogEnd\(opts\.vpxPrefDir\), t0\)/);
  assert.match(launcher, /function readLogEnd\(/);
});
