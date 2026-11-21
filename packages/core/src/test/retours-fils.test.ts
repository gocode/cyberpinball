// Dialogue avec l'équipe sur un rapport (packages/core/src/feedback-threads.ts) : les fils de la borne.
//
// Invariants fixés ici :
// - la réponse de l'équipe ne s'ouvre qu'avec la clé privée de son fil (ni un autre fil, ni une boîte
//   de rapport) ; la clé publique glissée dans le rapport est bien celle du fil ;
// - un fil relu du disque est le même, une entrée abîmée est écartée sans faire tomber les autres ;
// - une réponse publique sur une de mes propositions ouvre un fil, une fois ; changée, elle est redite ;
// - la borne ne relève que les fils récents, au plus THREAD_POLL_MAX ; elle garde THREADS_MAX fils,
//   ceux qui attendent une lecture d'abord ;
// - un fil sans aucun message (plantage sans réponse) ne se montre pas.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { FEEDBACK_KEYS, openSealedReport, sealReport, type Proposal } from '../feedback';
import {
  addMyLine,
  addThread,
  emptyThreadStore,
  loadThreads,
  markLineSent,
  markTeamThreadRead,
  mergeTeamReplies,
  newThread,
  noteProposalReplies,
  openTeamReply,
  saveThreads,
  sealTeamReply,
  THREAD_POLL_AGE_MS,
  THREAD_POLL_MAX,
  THREADS_FILE,
  THREADS_MAX,
  threadAnswerKey,
  threadsToPoll,
  threadsUnread,
  visibleThreads,
} from '../feedback-threads';

const NOW = Date.UTC(2026, 10, 21, 12);

test('fils : la réponse de l’équipe ne s’ouvre qu’avec la clé de son fil', () => {
  const { thread, answer } = newThread('report', 'Le DMD reste noir', NOW);
  assert.equal(threadAnswerKey(thread), answer);
  const box = sealTeamReply({ v: 1, text: '  Bonjour,\r\n\r\n\r\n\r\n\r\nc’est corrigé.\u0007 ', at: NOW }, answer);
  assert.deepEqual(openTeamReply(box, thread.key), { v: 1, text: 'Bonjour,\n\n\nc’est corrigé.', at: NOW });
  assert.equal(openTeamReply(box, newThread('report', 'Autre', NOW).thread.key), undefined);
  // Une boîte de rapport, même pour la même clé, n'est pas une réponse.
  assert.equal(openTeamReply(sealReport({ v: 1, kind: 'report', version: '', lang: 'fr', borne: 'x', at: NOW }, undefined, answer), thread.key), undefined);
});

test('fils : le rapport porte le fil, sa clé de réponse et, sauf anonymat, le pseudo', () => {
  // Le rapport reste lisible par la clé « retours » : seuls des champs s'ajoutent à l'enveloppe.
  assert.match(FEEDBACK_KEYS.seal, /^[0-9a-f]{64}$/);
  const { thread, answer } = newThread('report', 'Titre', NOW);
  const env = { v: 1 as const, kind: 'report' as const, version: '0.2.3', lang: 'fr', borne: 'b', at: NOW, fil: thread.fil, answer, who: { name: 'Pilote', country: 'FR' } };
  const team = crypto.generateKeyPairSync('x25519');
  const teamPublic = Buffer.from(team.publicKey.export({ format: 'jwk' }).x as string, 'base64url').toString('hex');
  const opened = openSealedReport(sealReport(env, undefined, teamPublic), team.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString());
  assert.deepEqual(opened?.envelope, env);
});

test('fils : relus du disque, les mêmes ; une entrée abîmée est écartée', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-fils-'));
  try {
    assert.deepEqual(loadThreads(dir), emptyThreadStore());
    const { thread } = newThread('crash', 'Glass Lagoon · VPX arrêté', NOW, { table: 'Glass Lagoon', anonymous: true });
    let store = addThread(emptyThreadStore(), thread);
    store = addMyLine(store, thread.fil, { id: 'm1', text: 'Il plante au lancement', at: NOW + 1, queued: true });
    store = markLineSent(store, thread.fil, 'm1');
    saveThreads(dir, store);
    assert.deepEqual(loadThreads(dir), store);
    const raw = JSON.parse(fs.readFileSync(path.join(dir, THREADS_FILE), 'utf8')) as { threads: unknown[] };
    raw.threads.push({ fil: 'court', key: 'x' }, null, { ...thread, fil: 'B'.repeat(22), origin: 'inconnue' });
    fs.writeFileSync(path.join(dir, THREADS_FILE), JSON.stringify(raw));
    assert.deepEqual(loadThreads(dir), store);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const proposal = (over: Partial<Proposal>): Proposal => ({ id: 'prop000001', kind: 'feature', title: 'Trier par fabricant', text: '', lang: 'fr', votes: 3, status: 'planned', at: NOW - 1000, updated: NOW - 500, merged: 0, ...over });

test('fils : une réponse publique sur ma proposition ouvre un fil, une fois ; changée, elle est redite', () => {
  let r = noteProposalReplies(emptyThreadStore(), [proposal({ mine: true, reply: 'Prévu pour la 0.3' }), proposal({ id: 'prop000002', reply: 'Pas la mienne' }), proposal({ id: 'prop000003', mine: true })], NOW);
  assert.equal(r.added.length, 1);
  assert.equal(r.store.threads.length, 1);
  const fil = r.store.threads[0]!;
  assert.equal(fil.origin, 'proposal');
  assert.equal(fil.proposal, 'prop000001');
  assert.equal(fil.title, 'Trier par fabricant');
  assert.equal(threadsUnread(r.store), 1);
  r = noteProposalReplies(markTeamThreadRead(r.store, fil.fil), [proposal({ mine: true, reply: 'Prévu pour la 0.3' })], NOW + 1);
  assert.equal(r.added.length, 0);
  assert.equal(threadsUnread(r.store), 0);
  r = noteProposalReplies(r.store, [proposal({ mine: true, reply: 'Arrivé dans la 0.3 !' })], NOW + 2);
  assert.equal(r.added.length, 1);
  assert.equal(r.store.threads.length, 1);
  assert.equal(r.store.threads[0]!.fil, fil.fil);
  assert.deepEqual(r.store.threads[0]!.lines.map((l) => l.text), ['Prévu pour la 0.3', 'Arrivé dans la 0.3 !']);
});

test('fils : relève des seuls fils récents, bornée ; fils gardés bornés, les non lus d’abord ; fil vide caché', () => {
  let store = emptyThreadStore();
  for (let i = 0; i < THREADS_MAX + 5; i++) store = addThread(store, { ...newThread('crash', `P${i}`, NOW - i * 1000).thread, ...(i === THREADS_MAX + 4 ? { unread: 1, lines: [{ id: 'x', from: 'team' as const, text: 'Réponse', at: NOW }] } : {}) });
  assert.equal(store.threads.length, THREADS_MAX);
  assert.ok(store.threads.some((x) => x.title === `P${THREADS_MAX + 4}`), 'le fil non lu reste');
  assert.equal(threadsToPoll(store, NOW).length, Math.min(THREADS_MAX, THREAD_POLL_MAX));
  const many = { v: 1 as const, threads: Array.from({ length: THREAD_POLL_MAX + 3 }, (_, i) => newThread('crash', `Q${i}`, NOW - i).thread) };
  assert.deepEqual(threadsToPoll(many, NOW).map((x) => x.fil), many.threads.slice(0, THREAD_POLL_MAX).map((x) => x.fil));
  const old = addThread(emptyThreadStore(), newThread('report', 'Ancien', NOW - THREAD_POLL_AGE_MS - 1).thread);
  assert.deepEqual(threadsToPoll(old, NOW), []);
  assert.deepEqual(visibleThreads(store).map((x) => x.title), [`P${THREADS_MAX + 4}`]);
  const { thread, answer } = newThread('report', 'Mon rapport', NOW);
  const merged = mergeTeamReplies(addThread(emptyThreadStore(), thread), [{ fil: thread.fil, id: 'r1', at: NOW + 5, data: Buffer.from('CPM1 abîmé') }, { fil: thread.fil, id: 'r2', at: NOW + 6, data: sealTeamReply({ v: 1, text: 'Lu', at: NOW }, answer) }]);
  assert.deepEqual(merged.added.map((a) => a.line.id), ['r2']);
  assert.equal(merged.store.threads[0]!.since, NOW + 6);
});
