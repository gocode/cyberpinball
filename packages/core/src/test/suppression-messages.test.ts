// Supprimer son message (novembre 2026) : dans les messages privés, un retrait signé part vers l'ami
// et y efface le message et ses réactions ; dans les salons, un retrait signé par l'auteur efface sa
// ligne partout et l'empêche de revenir par un relais. Personne ne retire le message d'un autre.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acknowledge,
  deleteMine,
  newChatState,
  parseChatMessage,
  receiveLines,
  threadLines,
  toWire,
  verifyWire,
  writeLine,
  type ChatState,
} from '../chat';
import {
  mergeRoomLines,
  newRoomsState,
  retractRoomLines,
  roomRetractions,
  signRoomLine,
  signRoomRetraction,
  tidyRooms,
  verifyRoomRetraction,
  ROOM_KEEP_DAYS,
  WORLD_ROOM,
} from '../rooms';
import { createPlayerKey } from '../sharing';

const T0 = new Date('2026-11-16T20:00:00Z');
const alice = createPlayerKey();
const bob = createPlayerKey();

/** Ce que la borne de Bob reçoit de celle d'Alice : passé par le fil, vérifié. */
function deliver(lines: { line?: import('../chat').ChatLine }[], bobState: ChatState): ChatState {
  const wires = lines.map((l) => toWire(l.line!));
  const parsed = parseChatMessage({ t: 'chat', m: JSON.parse(JSON.stringify(wires)) });
  assert.ok(parsed && parsed.t === 'chat');
  const verified = parsed.m.map((w) => verifyWire(w, alice.publicKey, bob.publicKey, T0)!);
  assert.ok(verified.every(Boolean), 'signatures valides');
  return receiveLines(bobState, alice.publicKey, verified).state;
}

test('Messages privés : mon message supprimé disparaît chez moi puis chez l’ami, réactions comprises', () => {
  const w1 = writeLine(newChatState(), alice, bob.publicKey, { text: 'Message à regretter' }, T0);
  const w2 = writeLine(w1.state, alice, bob.publicKey, { text: 'Celui-là reste' }, T0);
  let bobState = deliver([w1, w2], newChatState());
  // Bob réagit au premier ; Alice reçoit l'accusé.
  const react = writeLine(bobState, bob, alice.publicKey, { react: { target: w1.line!.id, kind: 'bravo' } }, T0);
  bobState = react.state;
  const aliceState = acknowledge(w2.state, bob.publicKey, [w1.line!.id, w2.line!.id]);
  assert.equal(threadLines(bobState.conversations[alice.publicKey]!).length, 2);
  assert.equal(bobState.conversations[alice.publicKey]!.unread, 2);

  const del = deleteMine(aliceState, alice, bob.publicKey, w1.line!.id, T0);
  assert.ok(del.line?.del, 'un retrait signé part');
  assert.deepEqual(threadLines(del.state.conversations[bob.publicKey]!).map((l) => l.text), ['Celui-là reste']);
  assert.equal(del.line.delivery, 'pending', 'en attente jusqu’à l’accusé, comme un message');

  bobState = deliver([del], bobState);
  const c = bobState.conversations[alice.publicKey]!;
  assert.deepEqual(threadLines(c).map((l) => l.text), ['Celui-là reste']);
  assert.ok(!c.lines.some((l) => l.react?.target === w1.line!.id), 'sa réaction part avec le message');
  assert.equal(c.unread, 1, 'le message supprimé ne compte plus parmi les non lus');
  // Renvoyé (accusé perdu) : rien ne change.
  assert.deepEqual(deliver([del], bobState), bobState);
});

test('Messages privés : on ne supprime ni le message de l’ami, ni chez lui un des siens', () => {
  const fromBob = writeLine(newChatState(), bob, alice.publicKey, { text: 'Message de Bob' }, T0);
  const aliceState = receiveLines(newChatState(), bob.publicKey, [verifyWire(toWire(fromBob.line!), bob.publicKey, alice.publicKey, T0)!]).state;
  assert.equal(deleteMine(aliceState, alice, bob.publicKey, fromBob.line!.id, T0).state, aliceState, 'pas un des miens : rien');
  // Un retrait d'Alice qui viserait un message de Bob, chez Bob, n'efface rien.
  const forged = writeLine(newChatState(), alice, bob.publicKey, { del: fromBob.line!.id }, T0);
  const after = deliver([forged], fromBob.state);
  assert.deepEqual(threadLines(after.conversations[alice.publicKey]!).map((l) => l.text), ['Message de Bob'], 'le message de Bob reste chez lui');
});

test('Messages privés : la signature d’un message ordinaire n’a pas changé (bornes d’avant le retrait)', () => {
  const w = writeLine(newChatState(), alice, bob.publicKey, { text: 'Bonjour' }, T0);
  const wire = toWire(w.line!);
  assert.equal('del' in wire, false);
  assert.ok(verifyWire(wire, alice.publicKey, bob.publicKey, T0));
  // Un retrait trafiqué (autre cible) ne passe pas.
  const d = writeLine(newChatState(), alice, bob.publicKey, { del: w.line!.id }, T0);
  assert.equal(verifyWire({ ...toWire(d.line!), del: '0123456789abcdef' }, alice.publicKey, bob.publicKey, T0), undefined);
});

test('Salons : ma ligne retirée disparaît, ne revient pas par un relais, et le retrait suit l’historique', () => {
  const me = { key: alice, name: 'Alice' };
  const line = signRoomLine(me, { room: WORLD_ROOM, text: 'Ligne à retirer' }, T0)!;
  const other = signRoomLine({ key: bob, name: 'Bob' }, { room: WORLD_ROOM, text: 'Ligne de Bob' }, T0)!;
  let s = mergeRoomLines(newRoomsState(), [line, other], T0).state;
  const del = signRoomRetraction(me, line, T0)!;
  assert.ok(verifyRoomRetraction(JSON.parse(JSON.stringify(del)), T0));
  const r = retractRoomLines(s, [del], T0);
  s = r.state;
  assert.deepEqual(r.removed.map((l) => l.id), [line.id]);
  assert.deepEqual(s.lines.map((l) => l.text), ['Ligne de Bob']);
  // Relayée encore par une borne qui ne sait pas : refusée.
  assert.equal(mergeRoomLines(s, [line], T0).fresh.length, 0);
  // Déjà connu : rien de nouveau à relayer.
  assert.equal(retractRoomLines(s, [del], T0).fresh.length, 0);
  assert.deepEqual(roomRetractions(s, WORLD_ROOM).map((d) => d.id), [line.id]);
});

test('Salons : personne ne retire la ligne d’un autre, et un retrait trafiqué est refusé', () => {
  const line = signRoomLine({ key: bob, name: 'Bob' }, { room: WORLD_ROOM, text: 'Ligne de Bob' }, T0)!;
  assert.equal(signRoomRetraction({ key: alice }, line, T0), undefined, 'pas ma ligne : pas de retrait');
  // Retrait signé par Alice mais qui prétend viser la ligne de Bob sous la clé d'Alice : sans effet.
  const s = mergeRoomLines(newRoomsState(), [line], T0).state;
  const forged = signRoomRetraction({ key: alice }, { ...line, key: alice.publicKey }, T0)!;
  assert.equal(retractRoomLines(s, [forged], T0).removed.length, 0);
  assert.deepEqual(retractRoomLines(s, [forged], T0).state.lines.map((l) => l.id), [line.id]);
  // Retrait qui prétend être de Bob sans sa clé : signature fausse.
  assert.equal(verifyRoomRetraction({ ...forged, key: bob.publicKey }, T0), undefined);
});

test('Salons : les retraits sont gardés sept jours, comme les lignes', () => {
  const me = { key: alice, name: 'Alice' };
  const line = signRoomLine(me, { room: WORLD_ROOM, text: 'x' }, T0)!;
  const s = retractRoomLines(newRoomsState(), [signRoomRetraction(me, line, T0)!], T0).state;
  assert.equal(s.retracted?.length, 1);
  const later = new Date(T0.getTime() + (ROOM_KEEP_DAYS + 1) * 86_400_000);
  assert.equal(tidyRooms(s, later).retracted, undefined);
});
