// Répondre en citant, mentionner un membre (citations.ts, chat.ts, groups.ts et app/src/group-service.ts
// compilé ; demande du 20/11/2026) :
// - l'extrait cité : deux premières lignes, coupé proprement sur un mot, « … » ; idempotent ;
// - compatibilité ascendante : la citation et les mentions voyagent dans une extension signée à part ; une
//   borne d'avant (qui ne garde que les champs qu'elle connaît) vérifie toujours le message et montre son
//   texte ; une extension fausse, déplacée ou mal formée tombe seule, le message reste ;
// - une mention d'un non-membre n'est jamais faite ni comptée ;
// - la notification de mention part une seule fois par personne mentionnée et par message, même groupe en
//   sourdine, même quand la ligne arrive d'abord sans son extension (relayée par une borne d'avant) ;
// - l'original supprimé ou disparu : la citation garde son texte et dit pourquoi.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { chatQuoteView, deleteMine, newChatState, parseChatMessage, receiveLines, toWire, verifyWire, writeLine, type ChatLine, type ChatState } from '../chat';
import { mentionPieces, parseExtras, QUOTE_MAX, quoteExcerpt, quoteOf, quoteView, resolveMentions, validMentions } from '../citations';
import { createGroup, groupLineMentions, groupQuoteView, groupView, mergeGroupLines, newGroupsState, saveGroups, signGroupLine, verifyGroupLine, type GroupLine } from '../groups';
import { createPlayerKey } from '../sharing';
import { listActions, visualOrder } from '../listzones';
import { fakeSocialNet } from './doublures';

// Dans le passé : une ligne datée du futur est refusée au chargement (groups.ts).
const T0 = new Date('2026-11-01T20:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);
const alice = createPlayerKey();
const bruno = createPlayerKey();
const carla = createPlayerKey();
const dave = createPlayerKey();

// ---------------------------------------------------------------------------
// L'extrait

test('extrait : les deux premières lignes, espaces resserrés, « … » s’il en restait', () => {
  assert.equal(quoteExcerpt('  Salut   tout le monde  '), 'Salut tout le monde');
  assert.equal(quoteExcerpt('Ligne une\n\n\nLigne deux'), 'Ligne une\nLigne deux', 'les lignes vides ne comptent pas');
  assert.equal(quoteExcerpt('Une\nDeux\nTrois'), 'Une\nDeux…');
  assert.equal(quoteExcerpt('Une,\nDeux,\nTrois'), 'Une,\nDeux…', 'pas de ponctuation qui pend avant « … »');
  assert.equal(quoteExcerpt('\n \n'), '');
});

test('extrait : coupé sur un mot entier, jamais au-delà de QUOTE_MAX ; un émoji compte pour un', () => {
  const long = 'Bravo pour ce record incroyable sur la table de la semaine, '.repeat(5);
  const e = quoteExcerpt(long);
  assert.ok([...e].length <= QUOTE_MAX, 'pas plus de QUOTE_MAX caractères');
  assert.ok(e.endsWith('…'));
  assert.ok(long.startsWith(e.slice(0, -1)), 'le début du texte, tel quel');
  assert.ok(/\p{L}…$/u.test(e), 'fini sur un mot entier');
  // Un mot sans fin : coupé net.
  const block = 'x'.repeat(400);
  assert.equal([...quoteExcerpt(block)].length, QUOTE_MAX);
  // Des émojis : jamais coupés en deux.
  const emojis = '🎯'.repeat(300);
  const ee = quoteExcerpt(emojis);
  assert.equal([...ee].length, QUOTE_MAX);
  assert.ok([...ee].slice(0, -1).every((c) => c === '🎯'));
});

test('extrait : idempotent (vérifié à l’arrivée), sur toute sorte de textes', () => {
  const samples = ['Court', 'Une\nDeux\nTrois', 'a '.repeat(200), '🎯'.repeat(300), 'Mot\n'.repeat(40), 'Fin,   \n  ;;;\nsuite', 'é'.repeat(141)];
  for (const s of samples) {
    const e = quoteExcerpt(s);
    assert.equal(quoteExcerpt(e), e, JSON.stringify(s).slice(0, 40));
  }
});

// ---------------------------------------------------------------------------
// Messages entre amis

/** Ce que reçoit la borne de Bruno : par le fil, vérifié ; `old` : une borne d'avant, qui ne garde que les champs qu'elle connaît. */
function deliverChat(line: ChatLine, to: ChatState, from = alice, me = bruno, old = false): ChatState {
  const wire = JSON.parse(JSON.stringify(toWire(line))) as Record<string, unknown>;
  if (old) {
    delete wire.x;
    delete wire.xs;
  }
  const parsed = parseChatMessage({ t: 'chat', m: [wire] });
  assert.ok(parsed && parsed.t === 'chat');
  const verified = verifyWire(parsed.m[0]!, from.publicKey, me.publicKey, T0);
  assert.ok(verified, 'le message est valable');
  return receiveLines(to, from.publicKey, [verified]).state;
}

test('messages privés : une réponse porte sa citation ; une borne d’avant montre le texte seul', () => {
  const first = writeLine(newChatState(), bruno, alice.publicKey, { text: 'On fait une partie ce soir ?\nJ’ai la table de la semaine.\nRéponds vite' }, T0);
  let aliceState = deliverChat(first.line!, newChatState(), bruno, alice);
  const quote = quoteOf({ id: first.line!.id, by: bruno.publicKey, name: 'Bruno', text: first.line!.text! })!;
  const reply = writeLine(aliceState, alice, bruno.publicKey, { text: 'Oui, à 21 h !', reply: quote }, at(10));
  aliceState = reply.state;
  assert.deepEqual(reply.line!.reply, { id: first.line!.id, by: bruno.publicKey, name: 'Bruno', text: 'On fait une partie ce soir ?\nJ’ai la table de la semaine.…' });

  const brunoNow = deliverChat(reply.line!, first.state);
  const got = brunoNow.conversations[alice.publicKey]!.lines.find((l) => l.id === reply.line!.id)!;
  assert.equal(got.text, 'Oui, à 21 h !');
  assert.deepEqual(got.reply, reply.line!.reply, 'la citation arrive, vérifiée');

  // Une borne d'avant : elle ne connaît ni x ni xs ; la signature du message vaut toujours, le texte s'affiche.
  const old = deliverChat(reply.line!, first.state, alice, bruno, true);
  const plain = old.conversations[alice.publicKey]!.lines.find((l) => l.id === reply.line!.id)!;
  assert.equal(plain.text, 'Oui, à 21 h !');
  assert.equal(plain.reply, undefined);
});

/** La première ligne d'un message « chat » reçu, contrôlée. */
function firstWire(raw: unknown) {
  const m = parseChatMessage({ t: 'chat', m: [raw] });
  assert.ok(m && m.t === 'chat');
  return m.m[0]!;
}

test('messages privés : une citation falsifiée ou déplacée tombe, le message reste', () => {
  const first = writeLine(newChatState(), bruno, alice.publicKey, { text: 'Original' }, T0);
  const quote = quoteOf({ id: first.line!.id, by: bruno.publicKey, name: 'Bruno', text: 'Original' })!;
  const reply = writeLine(newChatState(), alice, bruno.publicKey, { text: 'Réponse', reply: quote }, T0);
  const wire = JSON.parse(JSON.stringify(toWire(reply.line!)));
  // Falsifiée : on fait dire autre chose à Bruno.
  const forged = { ...wire, x: { reply: { ...wire.x.reply, text: 'Je triche' } } };
  const v1 = verifyWire(firstWire(forged), alice.publicKey, bruno.publicKey, T0)!;
  assert.equal(v1.text, 'Réponse');
  assert.equal(v1.reply, undefined);
  // Déplacée sur un autre message d'Alice : liée à l'identifiant, elle tombe.
  const other = writeLine(newChatState(), alice, bruno.publicKey, { text: 'Autre' }, T0);
  const moved = { ...JSON.parse(JSON.stringify(toWire(other.line!))), x: wire.x, xs: wire.xs };
  const v2 = verifyWire(firstWire(moved), alice.publicKey, bruno.publicKey, T0)!;
  assert.equal(v2.text, 'Autre');
  assert.equal(v2.reply, undefined);
  // Mal formée (extrait qui n'en est pas un) : jamais signée par un client honnête, refusée à la forme.
  assert.equal(parseExtras({ reply: { ...quote, text: 'Une\nDeux\nTrois' } }), undefined);
});

test('messages privés : l’original supprimé ou disparu, la citation garde son texte et dit pourquoi', () => {
  const first = writeLine(newChatState(), alice, bruno.publicKey, { text: 'Je supprimerai ce message' }, T0);
  const quote = quoteOf({ id: first.line!.id, by: alice.publicKey, name: 'Alice', text: first.line!.text! })!;
  const reply = writeLine(first.state, alice, bruno.publicKey, { text: 'Et je me cite', reply: quote }, at(5));
  const nameOf = (out: boolean) => (out ? 'Vous' : 'Bruno');
  let c = reply.state.conversations[bruno.publicKey]!;
  assert.deepEqual(chatQuoteView(c, quote, nameOf), { name: 'Vous', text: 'Je supprimerai ce message' });
  const del = deleteMine(reply.state, alice, bruno.publicKey, first.line!.id, at(9));
  c = del.state.conversations[bruno.publicKey]!;
  assert.deepEqual(chatQuoteView(c, quote, nameOf), { name: 'Alice', text: 'Je supprimerai ce message', missing: 'deleted' });
  // Effacé de la borne (conservation, effacement de la conversation) : plus là, sans retrait connu.
  assert.deepEqual(quoteView(quote, undefined, false), { name: 'Alice', text: 'Je supprimerai ce message', missing: 'gone' });
});

// ---------------------------------------------------------------------------
// Groupes : extension, mentions

const meA = { key: alice, name: 'Alice' };
const meB = { key: bruno, name: 'Bruno' };
const meC = { key: carla, name: 'Carla' };

/** Un groupe de Bruno avec Alice et Carla, Dave hors du groupe. */
const G = 'a'.repeat(16);
function groupLines(): GroupLine[] {
  // La ligne de création porte l'identifiant du groupe.
  return [
    signGroupLine(meB, G, { k: 'create', name: 'Jeudi' }, T0, G)!,
    signGroupLine(meB, G, { k: 'invite', who: alice.publicKey, whoName: 'Alice' }, at(1))!,
    signGroupLine(meB, G, { k: 'invite', who: carla.publicKey, whoName: 'Carla' }, at(1))!,
    signGroupLine(meA, G, { k: 'join' }, at(2))!,
    signGroupLine(meC, G, { k: 'join' }, at(2))!,
  ];
}

test('groupes : citation et mentions signées à part ; une borne d’avant garde et relaie le message', () => {
  const base = groupLines();
  const first = signGroupLine(meA, G, { k: 'msg', text: 'Qui bat mon record ?' }, at(10))!;
  const v = groupView([...base, first], at(20))!;
  const mentions = resolveMentions('@carla tu tentes ? Et @Bruno aussi', v.members, bruno.publicKey);
  assert.deepEqual(mentions, [carla.publicKey], 'jamais moi-même ; « @carla » sans tenir compte de la casse');
  const reply = signGroupLine(meB, G, { k: 'msg', text: '@carla tu tentes ? Et @Bruno aussi' }, at(30), undefined, { reply: quoteOf({ id: first.id, by: alice.publicKey, name: 'Alice', text: 'Qui bat mon record ?' })!, mentions })!;
  const wire = JSON.parse(JSON.stringify(reply));
  const checked = verifyGroupLine(wire, at(40))!;
  assert.deepEqual(checked.x, reply.x, 'l’extension arrive, vérifiée');
  // Une borne d'avant reconstruit la ligne avec ses seuls champs : la signature vaut, le texte s'affiche.
  const { x: _x, xs: _xs, ...old } = wire;
  const asOld = verifyGroupLine(old, at(40))!;
  assert.equal(asOld.body.k === 'msg' && asOld.body.text, '@carla tu tentes ? Et @Bruno aussi');
  assert.equal(asOld.x, undefined);
  // Falsifiée (une mention en plus), ou déplacée sur un autre message : elle tombe, le message reste.
  const forged = verifyGroupLine({ ...wire, x: { ...wire.x, mentions: [carla.publicKey, alice.publicKey] } }, at(40))!;
  assert.ok(forged && forged.x === undefined);
  const otherMsg = signGroupLine(meB, G, { k: 'msg', text: 'Autre chose' }, at(31))!;
  const moved = verifyGroupLine({ ...JSON.parse(JSON.stringify(otherMsg)), x: wire.x, xs: wire.xs }, at(40))!;
  assert.ok(moved && moved.x === undefined);
});

test('groupes : une mention d’un non-membre n’est ni faite ni comptée', () => {
  const base = groupLines();
  const v = groupView(base, at(20))!;
  // Dave n'est pas membre : son pseudo tapé ne le mentionne pas.
  assert.deepEqual(resolveMentions('Salut @Dave et @Alice', v.members, bruno.publicKey), [alice.publicKey]);
  // Une ligne signée qui mentionnerait quand même Dave (client modifié) : la mention ne compte pas à l'arrivée.
  const line = signGroupLine(meB, G, { k: 'msg', text: 'Salut @Dave et @Alice' }, at(30), undefined, { mentions: [dave.publicKey, alice.publicKey, bruno.publicKey] })!;
  const view = groupView([...base, line], at(40))!;
  assert.deepEqual(groupLineMentions(view, line), [alice.publicKey], 'ni le non-membre, ni l’auteur lui-même');
  assert.deepEqual(validMentions(line.x, bruno.publicKey, view.members), [alice.publicKey]);
});

test('groupes : la citation d’un message retiré garde son texte et le dit', () => {
  const base = groupLines();
  const first = signGroupLine(meA, G, { k: 'msg', text: 'Je vais le retirer' }, at(10))!;
  const reply = signGroupLine(meB, G, { k: 'msg', text: 'Trop tard' }, at(20), undefined, { reply: quoteOf({ id: first.id, by: alice.publicKey, name: 'Alice', text: 'Je vais le retirer' })! })!;
  const lines = [...base, first, reply];
  assert.deepEqual(groupQuoteView(lines, groupView(lines, at(30))!, reply), { name: 'Alice', text: 'Je vais le retirer' });
  const del = signGroupLine(meA, G, { k: 'del', target: first.id }, at(25))!;
  const after = [...lines, del];
  assert.deepEqual(groupQuoteView(after, groupView(after, at(30))!, reply), { name: 'Alice', text: 'Je vais le retirer', missing: 'deleted' });
  // Plus gardé du tout sur cette borne (trop ancien) : « plus affiché ».
  const gone = [...base, reply];
  assert.deepEqual(groupQuoteView(gone, groupView(gone, at(30))!, reply), { name: 'Alice', text: 'Je vais le retirer', missing: 'gone' });
});

test('groupes : une ligne venue sans son extension la reçoit ensuite (enrichie, pas nouvelle)', () => {
  const base = groupLines();
  let s = createGroup(newGroupsState(), base);
  const line = signGroupLine(meB, G, { k: 'msg', text: '@Carla à toi' }, at(30), undefined, { mentions: [carla.publicKey] })!;
  const { x: _x, xs: _xs, ...stripped } = line;
  const m1 = mergeGroupLines(s, G, [verifyGroupLine(JSON.parse(JSON.stringify(stripped)), at(40))!], carla.publicKey, at(40));
  assert.equal(m1.fresh.length, 1);
  assert.equal(m1.enriched.length, 0);
  s = m1.state;
  const m2 = mergeGroupLines(s, G, [verifyGroupLine(JSON.parse(JSON.stringify(line)), at(41))!], carla.publicKey, at(41));
  assert.equal(m2.fresh.length, 0, 'pas un nouveau message');
  assert.equal(m2.enriched.length, 1);
  assert.equal(m2.state.groups[G]!.unread, 1, 'compté une seule fois parmi les non lus');
  assert.deepEqual(m2.state.groups[G]!.lines.find((l) => l.id === line.id)!.x, line.x);
  // De nouveau : rien.
  const m3 = mergeGroupLines(m2.state, G, [line], carla.publicKey, at(42));
  assert.equal(m3.state, m2.state);
});

test('mentions mises en évidence : sans casse ni accent, mot entier, la mienne à part', () => {
  const pieces = mentionPieces('Salut @éloïse et @Bru, @Bruno !', [{ name: 'Éloïse', me: true }, { name: 'Bruno' }]);
  assert.deepEqual(pieces, [{ text: 'Salut ' }, { text: '@éloïse', mention: 'me' }, { text: ' et @Bru, ' }, { text: '@Bruno', mention: 'other' }, { text: ' !' }]);
  assert.deepEqual(mentionPieces('Rien ici', [{ name: 'Bruno' }]), [{ text: 'Rien ici' }]);
  assert.deepEqual(mentionPieces('@Brunoo', [{ name: 'Bruno' }]), [{ text: '@Brunoo' }], 'mot entier');
});

// ---------------------------------------------------------------------------
// Le service des groupes (app/dist) : la notification de mention

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');
type Handler = (key: string, message: Record<string, unknown>) => void;
interface Groups {
  send(g: string, text: string, reply?: string): { line?: GroupLine };
  setMuted(g: string, muted: boolean): void;
  view(g: string): ReturnType<typeof groupView>;
  stop(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const groupModule = require(path.join(APP_DIST, 'group-service.js')) as { createGroupService(o: object): Groups };
/* eslint-enable @typescript-eslint/no-require-imports */

/** Des bornes reliées en mémoire : chaque envoi arrive à l'autre, passé par JSON (comme sur le fil). */
function bus() {
  const handlers = new Map<string, Handler[]>();
  const log: { from: string; to: string; message: Record<string, unknown> }[] = [];
  let held = false;
  const queue: (() => void)[] = [];
  const net = (key: ReturnType<typeof createPlayerKey>, name: string) =>
    fakeSocialNet({
    state: () => ({ key, name, enabled: true, friends: [] }),
    online: () => true,
    reachable: () => true,
    country: () => undefined,
    setGroupPeers: () => undefined,
    sendGroupDirectory: () => 0,
    onMessage: (h: Handler) => {
      handlers.set(key.publicKey, [...(handlers.get(key.publicKey) ?? []), h]);
      return () => undefined;
    },
    send: (to: string, message: Record<string, unknown>) => {
      const copy = JSON.parse(JSON.stringify(message)) as Record<string, unknown>;
      log.push({ from: key.publicKey, to, message: copy });
      const run = () => {
        for (const h of handlers.get(to) ?? []) h(key.publicKey, copy);
      };
      if (held) queue.push(run);
      else run();
      return true;
    },
  });
  return { net, log, hold: () => (held = true), flush: () => { held = false; while (queue.length) queue.shift()!(); } };
}

function cabinetDir(name: string, lines: GroupLine[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-citations-${name}-`));
  saveGroups(dir, createGroup(newGroupsState(), lines));
  return dir;
}

test('notification de mention : une seule fois par personne mentionnée, même groupe en sourdine, jamais doublée d’un message ordinaire', async () => {
  const lines = groupLines();
  const b = bus();
  const mentioned: Record<string, string[]> = { Alice: [], Bruno: [], Carla: [] };
  const arrived: Record<string, string[]> = { Alice: [], Bruno: [], Carla: [] };
  const services = ([[alice, 'Alice'], [bruno, 'Bruno'], [carla, 'Carla']] as const).map(([key, name]) =>
    groupModule.createGroupService({
      net: b.net(key, name),
      dataDir: cabinetDir(name, lines),
      syncMs: 3_600_000,
      onMention: (_v: unknown, ls: GroupLine[]) => mentioned[name]!.push(...ls.map((l) => l.id)),
      onArrive: (_v: unknown, ls: GroupLine[]) => arrived[name]!.push(...ls.map((l) => l.id)),
    }),
  );
  try {
    const [aliceS, brunoS] = services;
    aliceS!.setMuted(G, true);
    // Bruno cite Alice et Carla (Alice deux fois) ; chacune relaie la ligne à l'autre : elle arrive deux fois.
    const r = brunoS!.send(G, '@Alice @alice et @Carla, partie à 22 h ?');
    assert.ok(r.line?.x?.mentions);
    assert.deepEqual(new Set(r.line.x.mentions), new Set([alice.publicKey, carla.publicKey]));
    assert.deepEqual(mentioned.Alice, [r.line.id], 'Alice, en sourdine, reçoit sa mention une fois');
    assert.deepEqual(mentioned.Carla, [r.line.id], 'Carla une fois, malgré le relais d’Alice');
    assert.deepEqual(mentioned.Bruno, [], 'l’auteur ne se notifie pas');
    assert.deepEqual(arrived.Carla, [], 'pas de notification ordinaire en plus');
    assert.deepEqual(arrived.Alice, []);
    // Un message ordinaire (d'Alice : Bruno attend 3 s entre deux envois) : la notification ordinaire, pas de mention.
    const plain = aliceS!.send(G, 'Sans mention');
    assert.ok(plain.line);
    assert.deepEqual(arrived.Carla, [plain.line.id]);
    assert.deepEqual(arrived.Bruno, [plain.line.id]);
    assert.equal(mentioned.Carla.length, 1);
    assert.equal(mentioned.Bruno.length, 0);
  } finally {
    for (const s of services) s.stop();
  }
});

test('notification de mention : ligne arrivée d’abord sans son extension (borne d’avant), mention annoncée à son arrivée, une fois', async () => {
  const lines = groupLines();
  const b = bus();
  const mentioned: string[] = [];
  const carlaS = groupModule.createGroupService({ net: b.net(carla, 'Carla'), dataDir: cabinetDir('Carla', lines), syncMs: 3_600_000, onMention: (_v: unknown, ls: GroupLine[]) => mentioned.push(...ls.map((l) => l.id)) });
  try {
    const line = signGroupLine(meB, G, { k: 'msg', text: '@Carla à toi de jouer' }, new Date(), undefined, { mentions: [carla.publicKey] })!;
    const { x: _x, xs: _xs, ...stripped } = line;
    // Relayée par une borne d'avant (Alice) : sans extension, pas de mention.
    const relay = b.net(alice, 'Alice');
    relay.send(carla.publicKey, { t: 'grp', lines: [stripped] });
    assert.deepEqual(mentioned, []);
    // La version complète, de Bruno : la mention est annoncée maintenant.
    const author = b.net(bruno, 'Bruno');
    author.send(carla.publicKey, { t: 'grp', lines: [line] });
    assert.deepEqual(mentioned, [line.id]);
    // Encore : rien.
    author.send(carla.publicKey, { t: 'grp', lines: [line] });
    relay.send(carla.publicKey, { t: 'grp', lines: [line] });
    assert.deepEqual(mentioned, [line.id]);
    assert.deepEqual(carlaS.view(G)!.messages.find((l) => l.id === line.id)!.x, line.x);
  } finally {
    carlaS.stop();
  }
});

test('flippers : la citation d’une bulle est un arrêt juste avant elle, dans la liste du fil', () => {
  // Rangs : 0 bulle sans citation ; 1 citation de la bulle 2 ; 3 « Écrire au groupe ».
  const source = { sections: [{ rows: [{ text: 'a', action: 0, pick: true }, { text: 'b', action: 2, pick: true, quote: { action: 1 } }] }] };
  assert.deepEqual(visualOrder(source, 4), [0, 1, 2, 3]);
  assert.deepEqual(listActions(source, 4), [0, 1, 2], 'la citation est dans la liste, pas parmi les actions de l’écran');
  // Rangs dans le désordre (citation poussée après sa bulle) : l'affichage fait foi.
  const late = { sections: [{ rows: [{ text: 'b', action: 0, pick: true, quote: { action: 1 } }] }] };
  assert.deepEqual(visualOrder(late, 2), [1, 0]);
});