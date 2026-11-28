// Fluidité de la partie (app/src/fluidite-partie.ts) : VPX en priorité « au-dessus de la normale ».
// 28/11/2026, PinCab (i9-9900K, playfield à 120 Hz, Back to the Future et son PuP-Pack, bille lancée) :
// avec 12 fils occupés en fond, 72 à 76 % des secondes passaient sous 108 i/s ; VPX en priorité
// au-dessus de la normale : 0 %. Ici : la priorité demandée (jamais « haute » ni « temps réel »), le
// réglage qui ne fait jamais échouer une partie, sa désactivation, et le branchement au lancement de
// chaque partie de VPX par le front-end.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const fp = require(path.join(REPO_ROOT, 'app', 'dist', 'fluidite-partie.js')) as {
  GAME_PRIORITY: number;
  priorityDisabled(env: NodeJS.ProcessEnv): boolean;
  tuneGameProcess(pid: number | undefined, log: (l: string) => void, env?: NodeJS.ProcessEnv, setPriority?: (pid: number, priority: number) => void): void;
};

test('priorité au-dessus de la normale, jamais haute ni temps réel', () => {
  assert.equal(fp.GAME_PRIORITY, os.constants.priority.PRIORITY_ABOVE_NORMAL);
  assert.notEqual(fp.GAME_PRIORITY, os.constants.priority.PRIORITY_HIGH);
  assert.notEqual(fp.GAME_PRIORITY, os.constants.priority.PRIORITY_HIGHEST);
});

test('la partie lancée reçoit la priorité, et le journal le dit', () => {
  const calls: [number, number][] = [];
  const lines: string[] = [];
  fp.tuneGameProcess(4321, (l) => lines.push(l), {}, (pid, prio) => calls.push([pid, prio]));
  assert.deepEqual(calls, [[4321, os.constants.priority.PRIORITY_ABOVE_NORMAL]]);
  assert.match(lines.join('\n'), /VPX en priorité au-dessus de la normale/);
});

test('un refus de Windows ne fait jamais échouer la partie', () => {
  const lines: string[] = [];
  assert.doesNotThrow(() => fp.tuneGameProcess(4321, (l) => lines.push(l), {}, () => { throw new Error('EPERM'); }));
  assert.match(lines.join('\n'), /refusée \(EPERM\)/);
});

test('désactivé par CYBERPINBALL_PRIORITE_PARTIE=normale, ou sans processus : rien n’est appelé', () => {
  assert.equal(fp.priorityDisabled({ CYBERPINBALL_PRIORITE_PARTIE: ' Normale ' }), true);
  assert.equal(fp.priorityDisabled({}), false);
  const calls: number[] = [];
  fp.tuneGameProcess(4321, () => {}, { CYBERPINBALL_PRIORITE_PARTIE: 'normale' }, (pid) => calls.push(pid));
  fp.tuneGameProcess(undefined, () => {}, {}, (pid) => calls.push(pid));
  assert.deepEqual(calls, []);
});

test('chaque partie de VPX lancée par le front-end passe par le réglage', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const launch = src.indexOf(': launchVpx({');
  const tune = src.indexOf('tuneGameProcess(game.pid');
  assert.ok(launch > 0 && tune > launch, 'tuneGameProcess(game.pid…) juste après launchVpx');
  assert.ok(tune - launch < 2500, 'branché au lancement, pas plus loin');
});
