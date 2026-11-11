// Messagerie entre amis (chat.ts) : écrire, signer, recevoir sans doublon, accuser, réagir,
// abandonner ce qui n'a pas pu partir, ne garder que la durée choisie, relire le fichier.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  acknowledge,
  CHAT_PENDING_DAYS,
  CHAT_TEXT_MAX,
  cleanChatText,
  clearConversation,
  loadChat,
  markRead,
  newChatState,
  parseChatMessage,
  pendingFor,
  reactionsOf,
  receiveLines,
  saveChat,
  setMuted,
  threadLines,
  tidyChat,
  toWire,
  unreadTotal,
  verifyWire,
  writeLine,
} from '../chat';
import { createPlayerKey } from '../sharing';
import { parsePhoneMessage } from '../remote';

const alice = createPlayerKey();
const bob = createPlayerKey();
const T0 = new Date('2026-11-11T20:00:00Z');

test('un message écrit est signé, en attente, et se vérifie chez le destinataire seulement', () => {
  const r = writeLine(newChatState(), alice, bob.publicKey, { text: '  On fait une partie ?  ' }, T0);
  assert.ok(r.line);
  assert.equal(r.line.text, 'On fait une partie ?');
  assert.equal(r.line.delivery, 'pending');
  assert.deepEqual(pendingFor(r.state, bob.publicKey).map((l) => l.id), [r.line.id]);
  const wire = toWire(r.line);
  const got = verifyWire(wire, alice.publicKey, bob.publicKey, T0);
  assert.equal(got?.text, 'On fait une partie ?');
  assert.equal(got?.out, false);
  // Un autre destinataire, un autre auteur ou un texte changé : refusé.
  assert.equal(verifyWire(wire, alice.publicKey, alice.publicKey, T0), undefined);
  assert.equal(verifyWire(wire, bob.publicKey, bob.publicKey, T0), undefined);
  assert.equal(verifyWire({ ...wire, text: 'Autre chose' }, alice.publicKey, bob.publicKey, T0), undefined);
});

test('texte vide, trop long ou de contrôle : rien n’est écrit', () => {
  const s = newChatState();
  assert.equal(writeLine(s, alice, bob.publicKey, { text: '   ' }, T0).line, undefined);
  assert.equal(writeLine(s, alice, bob.publicKey, { text: 'x'.repeat(CHAT_TEXT_MAX + 1) }, T0).line, undefined);
  assert.equal(cleanChatText('a\u0000b\r\nc\n\n\n\nd'), 'ab\nc\n\nd');
  // Un émoji compte pour un caractère.
  assert.ok(cleanChatText('🎯'.repeat(CHAT_TEXT_MAX)));
});

test('reçu deux fois : gardé une fois, accusé deux fois ; les réactions ne comptent pas comme non lues', () => {
  const w = writeLine(newChatState(), alice, bob.publicKey, { text: 'Revanche ce soir ?' }, T0);
  const line = verifyWire(toWire(w.line!), alice.publicKey, bob.publicKey, T0)!;
  let s = newChatState();
  let r = receiveLines(s, alice.publicKey, [line]);
  s = r.state;
  assert.deepEqual(r.ack, [line.id]);
  assert.equal(r.fresh.length, 1);
  assert.equal(unreadTotal(s), 1);
  r = receiveLines(s, alice.publicKey, [line]);
  assert.equal(r.state, s, 'un doublon ne change rien');
  assert.deepEqual(r.ack, [line.id]);
  // Bob réagit au message d'Alice : chez Alice, la réaction arrive sans non-lu.
  const re = writeLine(s, bob, alice.publicKey, { react: { target: line.id, kind: 'revanche' } }, T0);
  let a = w.state;
  const reLine = verifyWire(toWire(re.line!), bob.publicKey, alice.publicKey, T0)!;
  a = receiveLines(a, bob.publicKey, [reLine]).state;
  assert.equal(unreadTotal(a), 0);
  assert.equal(reactionsOf(a.conversations[bob.publicKey]!).get(line.id)?.theirs, 'revanche');
  assert.equal(threadLines(a.conversations[bob.publicKey]!).length, 1);
  // Retirée : null.
  const off = writeLine(re.state, bob, alice.publicKey, { react: { target: line.id, kind: null } }, T0);
  a = receiveLines(a, bob.publicKey, [verifyWire(toWire(off.line!), bob.publicKey, alice.publicKey, T0)!]).state;
  assert.equal(reactionsOf(a.conversations[bob.publicKey]!).get(line.id)?.theirs, undefined);
  s = markRead(s, alice.publicKey);
  assert.equal(unreadTotal(s), 0);
});

test('accusé : le message passe à « Reçu » et ne repart plus', () => {
  const w = writeLine(newChatState(), alice, bob.publicKey, { text: 'Bonne nuit !' }, T0);
  const s = acknowledge(w.state, bob.publicKey, [w.line!.id]);
  assert.equal(s.conversations[bob.publicKey]!.lines[0]!.delivery, 'received');
  assert.equal(pendingFor(s, bob.publicKey).length, 0);
  assert.equal(acknowledge(s, bob.publicKey, [w.line!.id]), s);
});

test('ménage : abandon après 30 jours d’attente, conservation selon le réglage', () => {
  const old = new Date(T0.getTime() - (CHAT_PENDING_DAYS + 1) * 86_400_000);
  let s = writeLine(newChatState(), alice, bob.publicKey, { text: 'Tu es là ?' }, old).state;
  s = tidyChat(s, T0);
  assert.equal(s.conversations[bob.publicKey]!.lines[0]!.delivery, 'expired');
  // 30 jours de conservation : le message abandonné (vieux de 31 jours) part.
  s = tidyChat({ ...s, keep: 30 }, T0);
  assert.equal(s.conversations[bob.publicKey]!.lines.length, 0);
  // « Toujours » : rien ne part.
  let k = writeLine({ ...newChatState(), keep: 0 }, alice, bob.publicKey, { text: 'Souvenir' }, new Date('2020-01-01T00:00:00Z')).state;
  k = acknowledge(k, bob.publicKey, k.conversations[bob.publicKey]!.lines.map((l) => l.id));
  assert.equal(tidyChat(k, T0), k);
});

test('fichier : relu tel qu’écrit, réglages compris ; une conversation s’efface seule', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-chat-'));
  try {
    let s = writeLine({ ...newChatState(), keep: 30, sound: false }, alice, bob.publicKey, { text: 'Merci !' }, T0).state;
    s = setMuted(s, bob.publicKey, true);
    saveChat(dir, s);
    const back = loadChat(dir);
    assert.deepEqual(back, s);
    assert.deepEqual(clearConversation(back, bob.publicKey).conversations, {});
    // Fichier abîmé : on repart d'un état neuf, sans planter.
    fs.writeFileSync(path.join(dir, 'amis', 'messagerie.json'), '{pas du json');
    assert.deepEqual(loadChat(dir), newChatState());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('messages du réseau : forme vérifiée, texte non nettoyé refusé, lots bornés', () => {
  const w = writeLine(newChatState(), alice, bob.publicKey, { text: 'Bien joué !' }, T0);
  const wire = toWire(w.line!);
  assert.deepEqual(parseChatMessage({ t: 'chat', m: [wire] }), { t: 'chat', m: [wire] });
  assert.equal(parseChatMessage({ t: 'chat', m: [{ ...wire, text: ' espaces ' }] }), undefined);
  assert.equal(parseChatMessage({ t: 'chat', m: [{ ...wire, id: 'zz' }] }), undefined);
  assert.deepEqual(parseChatMessage({ t: 'chat-ok', ids: [wire.id, 'nope'] }), { t: 'chat-ok', ids: [wire.id] });
  assert.deepEqual(parseChatMessage({ t: 'chat-hi', on: false }), { t: 'chat-hi', on: false });
  assert.equal(parseChatMessage({ t: 'chat-hi' }), undefined);
  assert.equal(parseChatMessage({ t: 'autre' }), undefined);
});

test('téléphone pendant la partie : écrire et réagir, formes vérifiées', () => {
  const key = 'a'.repeat(64);
  assert.deepEqual(parsePhoneMessage({ t: 'chat-send', s: 4, key, text: 'J’arrive' }), { t: 'chat-send', s: 4, key, text: 'J’arrive' });
  assert.equal(parsePhoneMessage({ t: 'chat-send', s: 4, key: 'pas-une-clé', text: 'x' }), undefined);
  assert.equal(parsePhoneMessage({ t: 'chat-send', s: 4, key, text: 'x'.repeat(5000) }), undefined);
  assert.deepEqual(parsePhoneMessage({ t: 'chat-react', s: 5, key, target: '0123456789abcdef', kind: 'bravo' }), { t: 'chat-react', s: 5, key, target: '0123456789abcdef', kind: 'bravo' });
  assert.equal(parsePhoneMessage({ t: 'chat-react', s: 5, key, target: 'court', kind: 'bravo' }), undefined);
});
