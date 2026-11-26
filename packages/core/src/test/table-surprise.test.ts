import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LaunchReservation, pickSurprise, readSurpriseExclusions, surpriseExcluded, SurpriseGesture, SurpriseSession, toggleSurpriseExclusion, type SurpriseCandidate, type SurpriseClock } from '../table-surprise';

class Clock implements SurpriseClock {
  now = 0;
  serial = 0;
  timers = new Map<number, { at: number; run(): void }>();
  after(ms: number, run: () => void): number { const id = ++this.serial; this.timers.set(id, { at: this.now + ms, run }); return id; }
  clear(id: unknown): void { this.timers.delete(id as number); }
  tick(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.now = next[1].at; this.timers.delete(next[0]); next[1].run();
    }
    this.now = end;
  }
}
const entries: SurpriseCandidate[] = [{ id: 'vpx-a', title: 'Galaxy' }, { id: 'fp-a', title: 'Ocean' }, { id: 'fx-a', title: 'Castle' }];
test('constructeurs : aucun rappel ne lit les constantes du menu avant la fin de son initialisation', () => {
  let calls = 0;
  const fail = (): never => { calls++; throw new Error('callback before initialization'); };
  new SurpriseSession({ gate: new LaunchReservation(), context: fail, candidates: fail, recheck: fail, released: fail, launch: fail, changed: fail, empty: fail, failed: fail });
  new SurpriseGesture({ left: fail, right: fail, magna: fail, allowed: fail, trigger: fail, cancel: fail, released: fail });
  assert.equal(calls, 0);
});
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function fixture() {
  const time = new Clock(), gate = new LaunchReservation();
  const f = { context: 'family', released: false, calls: [] as string[], empty: 0, errors: 0, candidates: async () => entries as readonly SurpriseCandidate[], recheck: async (_id: string) => true, launch: async (id: string, owner: symbol) => { assert.equal(gate.owns(owner), true); f.calls.push(id); } };
  const session = new SurpriseSession({ gate, context: () => f.context || undefined, released: () => f.released, candidates: () => f.candidates(), recheck: (id) => f.recheck(id), launch: (id, owner) => f.launch(id, owner), changed() {}, empty: () => f.empty++, failed: () => f.errors++, clock: time, random: () => .5 });
  return { f, session, time, gate };
}
function gesture() {
  const time = new Clock(); let triggers = 0, cancels = 0, releases = 0, allowed = true;
  const input = new SurpriseGesture({ left: () => ['Left', 'Joy1'], right: () => ['Right', 'Joy2'], magna: () => ['MagnaL', 'MagnaR'], allowed: () => allowed, trigger: () => triggers++, cancel: () => cancels++, released: () => releases++, clock: time });
  return { input, time, counts: () => ({ triggers, cancels, releases }), allow: (value: boolean) => allowed = value };
}

test('S01–S03 : appuis courts, alternés et un seul flip ne déclenchent rien', () => {
  const g = gesture();
  for (const key of ['Left', 'Right']) { g.input.input(key, true); g.time.tick(2000); g.input.input(key, false); }
  g.input.input('Left', true); g.time.tick(400); g.input.input('Right', true); g.time.tick(1499); g.input.input('Left', false); g.time.tick(2000);
  assert.equal(g.counts().triggers, 0);
});
test('S04 : seuil à partir du deuxième flip, une seule minuterie malgré les répétitions', () => {
  const g = gesture(); g.input.input('Left', true); g.time.tick(1000); g.input.input('Right', true);
  for (let i = 0; i < 20; i++) g.input.input('Right', true);
  assert.equal(g.time.timers.size, 1); g.time.tick(1499); assert.equal(g.counts().triggers, 0);
  g.time.tick(1); assert.equal(g.counts().triggers, 1); g.time.tick(5000); assert.equal(g.counts().triggers, 1);
});
test('S05 : boutons remappés et relâchements reconnus', () => {
  const g = gesture(); g.input.input('Joy1', true); g.input.input('Joy2', true); g.time.tick(1500);
  assert.equal(g.counts().triggers, 1); assert.equal(g.input.released, false);
  g.input.input('Joy1', false); g.input.input('Joy2', false); assert.equal(g.input.released, true);
});
test('S06 : perte du menu / focus impose le relâchement avant réarmement', () => {
  const g = gesture(); g.input.input('Left', true); g.input.input('Right', true); g.time.tick(1000); g.input.reset();
  g.time.tick(2000); g.input.input('Right', true); g.time.tick(2000); assert.equal(g.counts().triggers, 0);
  g.input.input('Left', false); g.input.input('Right', false); g.input.input('Left', true); g.input.input('Right', true); g.time.tick(1500); assert.equal(g.counts().triggers, 1);
});
for (const keys of [['MagnaL', 'Left', 'Right', 'MagnaR'], ['Left', 'Right', 'MagnaL', 'MagnaR'], ['Left', 'MagnaR', 'Right', 'MagnaL']]) test(`S07 : priorité MagnaSave, ordre ${keys.join(',')}`, () => {
  const g = gesture(); for (const key of keys) { g.input.input(key, true); g.time.tick(400); } g.time.tick(4000); assert.equal(g.counts().triggers, 0);
});
test('S08 : MagnaSave annule une session déjà déclenchée', async () => {
  const { session, gate } = fixture(); await session.start(); assert.equal(gate.busy, true); session.cancel(); assert.equal(gate.busy, false); assert.equal(session.view(), undefined);
});
test('S11 : tout entre dans le tirage sauf les tables exclues, et les collections exclues depuis Toutes les tables seulement', () => {
  const none = readSurpriseExclusions(undefined);
  const mine = [{ id: 'mine:adulte', tables: ['a', 'b'] }, { id: 'mine:famille', tables: ['b', 'c'] }];
  for (const from of ['all', 'mine:adulte', 'favorites', undefined]) assert.equal(surpriseExcluded('a', none, from, mine), false);
  const ex = { tables: ['c'], collections: ['mine:adulte'] };
  assert.equal(surpriseExcluded('c', ex, 'mine:famille', mine), true, 'une table exclue ne sort de nulle part');
  assert.equal(surpriseExcluded('a', ex, 'all', mine), true);
  assert.equal(surpriseExcluded('b', ex, 'all', mine), true, 'présente aussi dans une collection non exclue : reste exclue de Toutes les tables');
  assert.equal(surpriseExcluded('a', ex, 'mine:adulte', mine), false, 'tirer dans la collection exclue elle-même reste possible');
  assert.equal(surpriseExcluded('b', ex, 'mine:famille', mine), false);
  assert.equal(surpriseExcluded('a', ex, 'favorites', mine), false);
});
test('S11b : lecture tolérante (ancien format, fichier abîmé) et interrupteurs', () => {
  // Ancien format (autorisations table par table) : aucune exclusion, tout redevient tirable.
  assert.deepEqual(readSurpriseExclusions({ 'vpx-a': { audience: 'family', hidden: false, verified: 'x' } }), { tables: [], collections: [] });
  for (const bad of [null, 'x', 3, [], { tables: 'a', collections: [1, null] }]) assert.deepEqual(readSurpriseExclusions(bad), { tables: [], collections: [] });
  assert.deepEqual(readSurpriseExclusions({ tables: ['a', 'a', '', 2], collections: ['mine:x'] }), { tables: ['a'], collections: ['mine:x'] });
  let ex = toggleSurpriseExclusion(readSurpriseExclusions(undefined), 'tables', 'a');
  assert.deepEqual(ex, { tables: ['a'], collections: [] });
  ex = toggleSurpriseExclusion(toggleSurpriseExclusion(ex, 'collections', 'mine:x'), 'tables', 'a');
  assert.deepEqual(ex, { tables: [], collections: ['mine:x'] });
});
test('S11c : paire tenue, pour figer la roue pendant le geste', () => {
  const g = gesture(); assert.equal(g.input.pair, false);
  g.input.input('Left', true); assert.equal(g.input.pair, false);
  g.input.input('Joy2', true); assert.equal(g.input.pair, true);
  g.input.input('Left', false); assert.equal(g.input.pair, false);
});
test('S16 : zéro, un, bornes du générateur, variantes et moteurs équitables', () => {
  assert.equal(pickSurprise([], () => 0), undefined);
  assert.equal(pickSurprise([entries[0]!], () => .999)?.id, 'vpx-a');
  for (let i = 0; i < 3; i++) assert.equal(pickSurprise(entries, () => (i + .5) / 3)?.id, entries[i]!.id);
  assert.equal(pickSurprise([...entries, entries[0]!], () => .999)?.id, 'fx-a');
  assert.throws(() => pickSurprise(entries, () => 1));
  const variants = [{ id: 'a', title: 'Same' }, { id: 'b', title: 'Same' }]; assert.equal(pickSurprise(variants, () => .9)?.id, 'b');
});
test('S09–S10 : source exacte ; collection vide ne bascule jamais vers Toutes', async () => {
  const { f, session, gate } = fixture(); f.candidates = async () => []; await session.start(); assert.equal(f.empty, 1); assert.equal(session.busy, false); assert.equal(gate.busy, false); assert.deepEqual(f.calls, []);
});
test('S17 : annulation pendant le précontrôle, réponse tardive sans logo ni lancement', async () => {
  const { f, session, gate } = fixture(); const pending = deferred<readonly SurpriseCandidate[]>(); f.candidates = () => pending.promise;
  const start = session.start(); session.cancel(); pending.resolve(entries); await start; assert.equal(session.view(), undefined); assert.equal(gate.busy, false); assert.deepEqual(f.calls, []);
});
test('S20 : fin après trois secondes, attend les DEUX relâchements', async () => {
  const { f, session, time } = fixture(); await session.start(); time.tick(2999); await flush(); assert.deepEqual(f.calls, []);
  time.tick(1); await flush(); assert.equal(session.view()?.phase, 'release'); assert.deepEqual(f.calls, []);
  f.released = true; await session.release(); assert.deepEqual(f.calls, ['fp-a']);
});
test('S22 : Exit pendant la roulette ne laisse aucun lancement différé', async () => {
  const { f, session, time } = fixture(); await session.start(); session.cancel(); f.released = true; time.tick(5000); await session.release(); assert.deepEqual(f.calls, []);
});
test('S23–S24 : réservation immédiate contre Start, souris, téléphone et IPC concurrents', async () => {
  const { session, gate, f } = fixture(); const pending = deferred<readonly SurpriseCandidate[]>(); f.candidates = () => pending.promise;
  const start = session.start(); assert.equal(gate.busy, true); for (let i = 0; i < 4; i++) assert.equal(gate.reserve(), undefined);
  await session.start(); pending.resolve(entries); await start; session.cancel();
});
test('S17 / S27 : collection ou mode modifié pendant la roulette annule la session', async () => {
  const { f, session, time } = fixture(); await session.start(); f.context = 'normal'; session.refresh(); time.tick(3000); f.released = true; await session.release(); assert.deepEqual(f.calls, []);
});
test('S27 : Exit pendant la revérification asynchrone annule le commit', async () => {
  const { f, session, time } = fixture(); const pending = deferred<boolean>(); f.recheck = () => pending.promise;
  await session.start(); f.released = true; time.tick(3000); session.cancel(); pending.resolve(true); await flush(); assert.deepEqual(f.calls, []);
});
test('S27 : ancienne génération ne peut pas annuler ou lancer la nouvelle', async () => {
  const { f, session } = fixture(); const pending = deferred<readonly SurpriseCandidate[]>(); f.candidates = () => pending.promise;
  const old = session.start(); session.cancel(); f.candidates = async () => entries; await session.start(); const token = session.view()?.token;
  pending.resolve(entries); await old; assert.equal(session.view()?.token, token); session.cancel();
});
test('S13–S15 : prérequis devenus indisponibles avant le lancement', async () => {
  const { f, session, time } = fixture(); f.recheck = async () => false; await session.start(); f.released = true; time.tick(3000); await flush(); assert.deepEqual(f.calls, []); assert.equal(f.empty, 1);
});
test('S27 : un nouvel appui pendant la revérification exige un nouveau relâchement', async () => {
  const { f, session, time } = fixture(); const pending = deferred<boolean>(); f.recheck = () => pending.promise;
  await session.start(); f.released = true; time.tick(3000); f.released = false; pending.resolve(true); await flush(); assert.deepEqual(f.calls, []);
  f.released = true; await session.release(); assert.deepEqual(f.calls, ['fp-a']);
});
test('S28 : erreurs de précontrôle / vérification libèrent le verrou', async () => {
  for (const phase of ['candidates', 'recheck'] as const) {
    const { f, session, gate, time } = fixture(); f[phase] = async () => { throw Error('fixture'); };
    await session.start(); f.released = true; time.tick(3000); await flush(); assert.equal(gate.busy, false); assert.equal(session.busy, false); assert.equal(f.errors, 1);
  }
});
test('S28 : retour du lanceur et erreur de lancement permettent un nouveau tirage', async () => {
  for (const fails of [false, true]) {
    const { f, session, gate, time } = fixture(); f.launch = async () => { if (fails) throw Error('fixture'); };
    await session.start(); f.released = true; time.tick(3000); await flush(); assert.equal(gate.busy, false); assert.equal(session.busy, false); await session.start(); assert.equal(session.busy, true); session.cancel();
  }
});
test('S23 : appels release concurrents ne doublent pas le lancement', async () => {
  const { f, session, time } = fixture(); const pending = deferred<boolean>(); f.recheck = () => pending.promise;
  await session.start(); f.released = true; time.tick(3000); void session.release(); void session.release(); pending.resolve(true); await flush(); assert.deepEqual(f.calls, ['fp-a']);
});
test('S01 : hors menu, aucun maintien ne peut s’armer', () => { const g = gesture(); g.allow(false); g.input.input('Left', true); g.input.input('Right', true); g.time.tick(6000); assert.equal(g.counts().triggers, 0); });
test('S22–S24 : annulation pendant le await du lanceur natif invalide sa réservation', async () => {
  const { f, session, time, gate } = fixture(); const backup = deferred<void>();
  f.launch = async (id, owner) => { await backup.promise; if (gate.owns(owner)) f.calls.push(id); };
  await session.start(); f.released = true; time.tick(3000); await flush();
  assert.equal(gate.busy, true); gate.cancelPending(); backup.resolve(); await flush();
  assert.deepEqual(f.calls, []); assert.equal(gate.busy, false);
});
test('S27 : rejet tardif d’une vérification annulée ne perturbe pas la session suivante', async () => {
  const { f, session, time } = fixture(); const pending = deferred<boolean>(); f.recheck = () => pending.promise;
  await session.start(); f.released = true; time.tick(3000); session.cancel();
  await session.start(); const token = session.view()?.token;
  pending.reject(new Error('late rejection')); await flush();
  assert.equal(f.errors, 0); assert.equal(session.view()?.token, token); assert.deepEqual(f.calls, []); session.cancel();
});
test('S07 : après MagnaSave, les flips doivent être relâchés avant de pouvoir réarmer', () => {
  const g = gesture(); g.input.input('Left', true); g.input.input('Right', true); g.time.tick(500);
  g.input.input('MagnaL', true); g.input.input('MagnaL', false); g.time.tick(5000); assert.equal(g.counts().triggers, 0);
  g.input.input('Left', false); g.input.input('Right', false); g.input.input('Left', true); g.input.input('Right', true); g.time.tick(1500); assert.equal(g.counts().triggers, 1);
});
