// Réactions par emoji, présence et notifications des salons, flippers du clavier à l'écran
// (16/11/2026). Ces tests fixent la classe de comportement :
// - les sept réactions sont les mêmes partout (messages privés, salons) ; un joueur en pose une par
//   message, la dernière vaut, null la retire ; les anciennes réactions de la messagerie restent lues ;
// - une réaction de salon est signée, vérifiée, relayée sans doublon, gardée 7 jours ;
// - le nombre de présents d'un salon ne se dit qu'au-delà de cinq ;
// - la notification d'une ligne de salon tient jusqu'à deux minutes, mais cède sa place dès qu'une
//   autre attend, et part quand le salon s'ouvre ; elle n'entre pas au journal d'activité ;
// - les flippers parcourent toujours les touches du clavier à l'écran, même après un texte tapé.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { reactionLabel, reactionsOf, receiveLines, newChatState, toWire, verifyWire, writeLine, CHAT_REACTIONS } from '../chat';
import { NOTICE_RULES, NOTICE_SHOW_MS, createNoticeCenter, noticeText, type NoticeEvent } from '../notices';
import { countReactions, reactionChip, REACTION_EMOJI, REACTIONS } from '../reactions';
import {
  loadRooms,
  mergeRoomLines,
  mergeRoomReactions,
  newRoomsState,
  reactionsByLine,
  roomReactions,
  saveRooms,
  shownPresent,
  signRoomLine,
  signRoomReaction,
  verifyRoomReaction,
  ROOM_KEEP_DAYS,
  ROOM_LINGER_MS,
} from '../rooms';
import { createPlayerKey } from '../sharing';
import { flipperMovesKey } from '../textedit';

const kiko = { key: createPlayerKey(), name: 'Kiko' };
const sillage = { key: createPlayerKey(), name: 'Sillage' };
const T0 = new Date('2026-11-16T20:00:00Z');
const later = (ms: number) => new Date(T0.getTime() + ms);

test('les sept réactions : un emoji chacune, distinct, et les mêmes dans la messagerie', () => {
  assert.equal(REACTIONS.length, 7);
  assert.equal(new Set(REACTIONS.map((r) => REACTION_EMOJI[r])).size, 7);
  assert.deepEqual([...CHAT_REACTIONS], [...REACTIONS]);
  assert.equal(reactionLabel('love'), '❤️ J’adore');
});

test('décompte : une pastille par emoji, chaque joueur une fois (sa dernière), retirée ne compte pas', () => {
  const me = 'moi';
  const counts = countReactions(
    [
      { key: 'a', kind: 'like' },
      { key: 'b', kind: 'like' },
      { key: me, kind: 'haha' },
      { key: me, kind: 'like' },
      { key: 'c', kind: 'sad' },
      { key: 'c', kind: null },
    ],
    me,
  );
  assert.deepEqual(counts.map((c) => [c.kind, c.count, c.mine]), [['like', 3, true]]);
  assert.equal(reactionChip(counts[0]!), '👍 3');
  assert.equal(reactionChip({ emoji: '😮', count: 1 }), '😮');
});

test('messagerie : une nouvelle réaction fait l’aller-retour, une ancienne (Revanche ?) reste lue', () => {
  const w = writeLine(newChatState(), kiko.key, sillage.key.publicKey, { text: 'Revanche ce soir ?' }, T0);
  const line = verifyWire(toWire(w.line!), kiko.key.publicKey, sillage.key.publicKey, T0)!;
  const s = receiveLines(newChatState(), kiko.key.publicKey, [line]).state;
  for (const kind of ['love', 'revanche'] as const) {
    const re = writeLine(s, sillage.key, kiko.key.publicKey, { react: { target: line.id, kind } }, T0);
    const got = verifyWire(toWire(re.line!), sillage.key.publicKey, kiko.key.publicKey, T0);
    assert.ok(got, kind);
    const a = receiveLines(w.state, sillage.key.publicKey, [got]).state;
    assert.equal(reactionsOf(a.conversations[sillage.key.publicKey]!).get(line.id)?.theirs, kind);
  }
  assert.match(reactionLabel('revanche'), /Revanche/);
});

test('salon : une réaction est signée et vérifiée ; changée, d’un autre auteur ou trop vieille, refusée', () => {
  const line = signRoomLine(kiko, { room: 'pays-FR', text: 'Quelqu’un sur Comet Chaser ?' }, T0)!;
  const r = signRoomReaction(sillage, line, 'haha', T0);
  assert.ok(verifyRoomReaction(JSON.parse(JSON.stringify(r)), T0));
  assert.equal(verifyRoomReaction({ ...r, kind: 'angry' }, T0), undefined);
  assert.equal(verifyRoomReaction({ ...r, key: kiko.key.publicKey }, T0), undefined);
  assert.equal(verifyRoomReaction({ ...r, kind: 'bravo' }, T0), undefined, 'hors des sept : refusée');
  assert.equal(verifyRoomReaction(r, later((ROOM_KEEP_DAYS + 1) * 86_400_000)), undefined);
  assert.ok(verifyRoomReaction(signRoomReaction(sillage, line, null, T0), T0), 'retirer se signe aussi');
});

test('salon : la dernière réaction d’un joueur vaut, un doublon n’est pas relayé, l’historique les joint', () => {
  let s = mergeRoomLines(newRoomsState(), [signRoomLine(kiko, { room: 'pays-FR', text: 'Bonsoir' }, T0)!], T0).state;
  const line = s.lines[0]!;
  const first = signRoomReaction(sillage, line, 'like', later(1000));
  const second = signRoomReaction(sillage, line, 'love', later(2000));
  let m = mergeRoomReactions(s, [first], later(2000));
  assert.equal(m.fresh.length, 1);
  s = m.state;
  m = mergeRoomReactions(s, [first], later(2000));
  assert.equal(m.fresh.length, 0, 'déjà connue : ni gardée ni relayée');
  s = mergeRoomReactions(s, [second], later(2000)).state;
  // Reçue en retard, la plus ancienne ne remplace pas la plus récente.
  s = mergeRoomReactions(s, [first], later(3000)).state;
  assert.deepEqual(countReactions(reactionsByLine(s).get(line.id) ?? [], kiko.key.publicKey).map((c) => c.kind), ['love']);
  s = mergeRoomReactions(s, [signRoomReaction(sillage, line, null, later(4000))], later(4000)).state;
  assert.deepEqual(countReactions(reactionsByLine(s).get(line.id) ?? [], kiko.key.publicKey), []);
  assert.equal(roomReactions(s, 'pays-FR').length, 1);
  assert.equal(roomReactions(s, 'monde').length, 0);
});

test('salon : réactions et réglage des notifications relus du fichier ; 7 jours au plus', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reactions-'));
  try {
    let s = mergeRoomLines(newRoomsState(), [signRoomLine(kiko, { room: 'pays-FR', text: 'Bonsoir' }, T0)!], T0).state;
    s = mergeRoomReactions(s, [signRoomReaction(sillage, s.lines[0]!, 'wow', T0)], T0).state;
    saveRooms(dir, { ...s, lineNotices: false });
    const back = loadRooms(dir, T0);
    assert.equal(back.reactions?.length, 1);
    assert.equal(back.lineNotices, false);
    assert.equal(loadRooms(dir, later((ROOM_KEEP_DAYS + 1) * 86_400_000)).reactions, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('le nombre de présents ne se dit qu’au-delà de cinq ; un salon quitté reste annoncé une minute', () => {
  assert.equal(shownPresent(0), undefined);
  assert.equal(shownPresent(5), undefined);
  assert.equal(shownPresent(6), 6);
  assert.equal(ROOM_LINGER_MS, 60_000);
});

function roomLine(id: string, at: number, extra = 'Salut'): NoticeEvent {
  return { kind: 'room-line', key: `pays-FR|${id}`, at, who: 'Kiko', subject: 'Salon France', extra };
}

test('notification d’une ligne de salon : tenue jusqu’à deux minutes, au menu seulement, hors du journal', () => {
  const rule = NOTICE_RULES['room-line'];
  assert.equal(rule.holdMs, 120_000);
  assert.equal(rule.ttlMs, 120_000);
  assert.equal(rule.journal, false);
  assert.equal(rule.away, undefined, 'pas par-dessus une partie');
  const center = createNoticeCenter();
  center.push([roomLine('a', 0)]);
  const first = center.tick(10_000, { canShow: true });
  assert.ok(first.view);
  assert.equal(first.nextAt, 10_000 + 120_000);
  // Toujours là bien après la durée ordinaire.
  assert.equal(center.tick(10_000 + NOTICE_SHOW_MS * 5, { canShow: true }).view?.id, first.view.id);
  assert.equal(noticeText('room-line', [roomLine('a', 0)]).title, 'Kiko · Salon France');
  assert.match(noticeText('room-line', [roomLine('a', 0), roomLine('b', 1)]).title, /2 nouveaux messages · Salon France/);
});

test('notification d’une ligne de salon : elle cède sa place à une autre, et part quand le salon s’ouvre', () => {
  const center = createNoticeCenter();
  center.push([roomLine('a', 0)]);
  const shown = center.tick(10_000, { canShow: true }).view!;
  center.push([{ kind: 'friend-message', key: 'm1', at: 11_000, who: 'Sillage', player: 'p', extra: 'Coucou' }]);
  // Avant NOTICE_SHOW_MS, elle reste ; après, elle part pour laisser la place.
  assert.equal(center.tick(12_000, { canShow: true }).view?.id, shown.id);
  const after = center.tick(10_000 + NOTICE_SHOW_MS, { canShow: true });
  assert.equal(after.view?.leaving, true);
  // Le salon ouvert : elle n'a plus lieu d'être.
  const c2 = createNoticeCenter();
  c2.push([roomLine('b', 0)]);
  c2.tick(10_000, { canShow: true });
  assert.equal(c2.tick(20_000, { canShow: true, still: () => false }).view?.leaving, true);
});

test('flippers sur le clavier à l’écran : toujours un pas, même après un texte tapé ; Maj tenu ne défile pas', () => {
  assert.ok(flipperMovesKey(false, { code: 'ShiftLeft' }));
  assert.ok(flipperMovesKey(true, { code: 'ShiftLeft' }), 'après un texte tapé, le flipper répond encore');
  assert.ok(flipperMovesKey(true, { code: 'ShiftRight', isAutoRepeat: false }));
  assert.ok(!flipperMovesKey(true, { code: 'ShiftLeft', isAutoRepeat: true }), 'Maj tenu pour une majuscule : un seul pas');
  assert.ok(flipperMovesKey(false, { code: 'ShiftLeft', isAutoRepeat: true }), 'flipper tenu sans texte tapé : défile');
  assert.ok(flipperMovesKey(true, { code: 'KeyA', isAutoRepeat: true }));
});
