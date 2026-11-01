// Limite du débit des téléchargements depuis les amis (packages/core/src/ratelimit.ts,
// app/src/friend-content.ts, compilé) : le rythme d'un envoi, la limite partagée entre les
// réceptions, le protocole (file-get `rate`, file-rate) et un vrai transfert entre deux bornes
// reliées en mémoire, sans réseau.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { parseLibraryMessage, type TableFile } from '../friendlibrary';
import { setLanguage } from '../i18n';
import { layoutOf } from '../locations';
import { DOWNLOAD_RATE_CHOICES, RATE_BURST_MS, RATE_MIN, RatePacer, parseRate, rateLabel, rateShare } from '../ratelimit';
import { newSocialState, parseSocialState } from '../social';
import { tableContents } from '../tablecontents';
import { scanTables, type TableEntry } from '../tables';

const KIO = 1024;

/** Horloge d'essai : le temps n'avance que par les attentes. */
function fakeClock() {
  let now = 0;
  const waits: number[] = [];
  return {
    clock: { now: () => now, sleep: async (ms: number) => void (waits.push(ms), (now += ms)) },
    waits,
    advance: (ms: number) => void (now += ms),
    get now() {
      return now;
    },
  };
}

test('rythme d’un envoi : le débit moyen tenu, changé en route, sans limite à 0', async () => {
  const c = fakeClock();
  const pacer = new RatePacer(256 * KIO, c.clock);
  for (let i = 0; i < 8; i++) await pacer.take(64 * KIO);
  // 512 Kio à 256 Kio/s : 2 s.
  assert.equal(c.now, 2000);
  pacer.setRate(512 * KIO);
  for (let i = 0; i < 8; i++) await pacer.take(64 * KIO);
  assert.equal(c.now, 3000);
  pacer.setRate(0);
  const before = c.waits.length;
  for (let i = 0; i < 100; i++) await pacer.take(64 * KIO);
  assert.equal(c.waits.length, before, 'sans limite : aucune attente');
});

test('rythme d’un envoi : un réveil en retard est rattrapé, une longue pause ne donne que RATE_BURST_MS d’avance', async () => {
  const c = fakeClock();
  const pacer = new RatePacer(64 * KIO, c.clock);
  await pacer.take(64 * KIO);
  assert.equal(c.now, 1000);
  // Le minuteur s'est réveillé 40 ms trop tard : le morceau suivant attend d'autant moins.
  c.advance(40);
  await pacer.take(64 * KIO);
  assert.equal(c.now, 2000);
  // Dix secondes sans rien envoyer : seulement 250 ms d'avance, pas une rafale de 10 s.
  c.advance(10_000);
  await pacer.take(64 * KIO);
  assert.equal(c.now, 12_000 + 1000 - RATE_BURST_MS);
});

test('limite partagée entre les réceptions en cours ; débits lus et écrits', () => {
  assert.equal(rateShare(0, 3), 0);
  assert.equal(rateShare(1024 * KIO, 1), 1024 * KIO);
  assert.equal(rateShare(1024 * KIO, 4), 256 * KIO);
  // Jamais si lent qu'un envoi garderait la place de l'ami ou dépasserait le délai du receveur.
  assert.equal(rateShare(256 * KIO, 100), RATE_MIN);
  assert.equal(parseRate(0), 0);
  assert.equal(parseRate(RATE_MIN - 1), undefined);
  assert.equal(parseRate(1.5), undefined);
  assert.equal(parseRate('512'), undefined);
  for (const choice of DOWNLOAD_RATE_CHOICES) assert.equal(parseRate(choice), choice, 'chaque choix proposé est accepté');
  setLanguage('fr');
  assert.equal(rateLabel(0), 'sans limite');
  assert.equal(rateLabel(512 * KIO), '512 ko/s (4,2 Mbit/s)');
  assert.equal(rateLabel(2 * 1024 * KIO), '2,0 Mo/s (17 Mbit/s)');
  setLanguage('en');
  assert.equal(rateLabel(512 * KIO), '512 KB/s (4.2 Mbit/s)');
  setLanguage('fr');
});

test('protocole : `rate` dans file-get, file-rate en route ; un débit invalide est refusé', () => {
  assert.deepEqual(parseLibraryMessage({ t: 'file-get', req: 3, table: 'a'.repeat(16), file: 'b'.repeat(16), rate: 512 * KIO }), { t: 'file-get', req: 3, table: 'a'.repeat(16), file: 'b'.repeat(16), rate: 512 * KIO });
  assert.equal(parseLibraryMessage({ t: 'file-get', req: 3, table: 'a'.repeat(16), file: 'b'.repeat(16), rate: -1 }), undefined);
  assert.deepEqual(parseLibraryMessage({ t: 'file-rate', req: 3, rate: 0 }), { t: 'file-rate', req: 3, rate: 0 });
  assert.equal(parseLibraryMessage({ t: 'file-rate', req: 3, rate: 12 }), undefined);
  assert.equal(parseLibraryMessage({ t: 'file-rate', req: 0, rate: RATE_MIN }), undefined);
});

test('social.json : sans limite par défaut, la limite relue, une valeur invalide oubliée', () => {
  const s = newSocialState();
  assert.equal(s.downloadRate, undefined);
  assert.equal(parseSocialState({ ...s, downloadRate: 1024 * KIO })?.downloadRate, 1024 * KIO);
  assert.equal(parseSocialState({ ...s, downloadRate: 'vite' })?.downloadRate, undefined);
  assert.equal(parseSocialState({ ...s, downloadRate: 0 })?.downloadRate, undefined);
});

// ---------------------------------------------------------------------------
// Deux bornes reliées en mémoire : Bruno partage une table, Alice la reçoit.

/* eslint-disable @typescript-eslint/no-require-imports */
const { createFriendContent } = require(path.join(REPO_ROOT, 'app', 'dist', 'friend-content.js')) as {
  createFriendContent(o: object): {
    library(key: string): { state: string; library?: { tables: { id: string }[] } };
    tableFiles(key: string, tableId: string): Promise<TableFile[] | string>;
    fetchFile(key: string, tableId: string, id: string, target: object, part: string, onBytes?: (n: number) => void): Promise<{ file?: string; reason?: string }>;
    stop(): void;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

type Handler = (key: string, message: Record<string, unknown>) => void;
type ChunkHandler = (key: string, frame: Buffer) => void;

function pair() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-debit-'));
  const root = path.join(base, 'bruno');
  const folder = path.join(layoutOf(root).tables, 'Terminator 2 (Williams 1991)');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'Terminator 2 (Williams 1991).vpx'), Buffer.alloc(640 * KIO, 7));
  const handlers: Record<string, Handler> = {};
  const chunks: Record<string, ChunkHandler> = {};
  const sent: Record<string, unknown>[] = [];
  const state = { alice: { shareLibrary: true } as { shareLibrary: boolean; downloadRate?: number }, bruno: { shareLibrary: true } };
  // Remise au tour suivant, dans l'ordre : comme un flux.
  const net = (me: 'alice' | 'bruno', other: 'alice' | 'bruno') => ({
    state: () => state[me],
    online: () => true,
    send: (_key: string, message: Record<string, unknown>) => {
      sent.push({ from: me, ...message });
      const copy = JSON.parse(JSON.stringify(message)) as Record<string, unknown>;
      setImmediate(() => handlers[other]?.(me, parseLibraryMessage(copy) as unknown as Record<string, unknown>));
      return true;
    },
    sendChunk: async (_key: string, frame: Buffer) => {
      const copy = Buffer.from(frame);
      setImmediate(() => chunks[other]?.(me, copy));
      return true;
    },
    onMessage: (fn: Handler) => ((handlers[me] = fn), () => undefined),
    onChunk: (fn: ChunkHandler) => ((chunks[me] = fn), () => undefined),
  });
  const common = { root: () => undefined, contents: () => undefined };
  const alice = createFriendContent({ ...common, net: net('alice', 'bruno'), dataDir: path.join(base, 'alice'), tables: () => [] });
  const bruno = createFriendContent({
    net: net('bruno', 'alice'),
    dataDir: path.join(base, 'donnees-bruno'),
    tables: () => scanTables(layoutOf(root).tables),
    root: () => root,
    contents: (table: TableEntry) => tableContents(table.file, { ownFolder: true, romLibrary: layoutOf(root).roms }),
  });
  return { base, alice, bruno, state, sent };
}

async function until(what: string, check: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

test('transfert entre amis : à la limite choisie, levée en route, pleine vitesse sans limite', async () => {
  const p = pair();
  try {
    await until('bibliothèque de Bruno', () => p.alice.library('bruno').state === 'ready');
    const tableId = p.alice.library('bruno').library!.tables[0]!.id;
    const files = await p.alice.tableFiles('bruno', tableId);
    assert.ok(Array.isArray(files));
    const vpx = files.find((f) => f.rel.endsWith('.vpx'))!;
    const fetch = (name: string, onBytes?: (n: number) => void) => p.alice.fetchFile('bruno', tableId, vpx.id, { kind: 'file', dest: path.join(p.base, 'alice', 'amis', 'tables', 'T2', name) }, path.join(p.base, 'alice', 'amis', 'tables', 'T2', `${name}.part`), onBytes);

    // Sans limite : la demande ne porte aucun débit, le fichier arrive d'un trait.
    let started = Date.now();
    const free = await fetch('libre.vpx');
    assert.ok(free.file, free.reason);
    assert.ok(Date.now() - started < 1500, 'sans limite');
    assert.equal(p.sent.find((m) => m.t === 'file-get')!.rate, undefined);

    // 256 ko/s : 640 ko en 2,5 s environ ; la demande le dit à Bruno.
    p.state.alice.downloadRate = 256 * KIO;
    started = Date.now();
    const limited = await fetch('limite.vpx');
    const seconds = (Date.now() - started) / 1000;
    assert.ok(limited.file, limited.reason);
    assert.equal(fs.statSync(limited.file).size, 640 * KIO);
    assert.ok(seconds >= 2.2 && seconds < 4, `640 ko à 256 ko/s : ${seconds} s`);
    assert.equal(p.sent.filter((m) => m.t === 'file-get').at(-1)!.rate, 256 * KIO);

    // Limite levée pendant l'envoi : Bruno l'apprend (file-rate) et finit à pleine vitesse.
    p.state.alice.downloadRate = 64 * KIO;
    started = Date.now();
    let lifted = false;
    const result = await fetch('levee.vpx', (bytes) => {
      if (bytes > 0 && !lifted) {
        lifted = true;
        delete p.state.alice.downloadRate;
      }
    });
    assert.ok(result.file, result.reason);
    assert.ok(Date.now() - started < 4000, 'la limite levée vaut pour la suite de l’envoi (10 s à 64 ko/s)');
    assert.deepEqual(p.sent.filter((m) => m.t === 'file-rate').map((m) => m.rate), [0]);
  } finally {
    p.alice.stop();
    p.bruno.stop();
  }
});
