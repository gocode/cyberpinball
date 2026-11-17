// Groupes privés (groups.ts, et app/src/group-service.ts compilé) :
// - la suite des lignes fait le groupe : seul un membre invite, écrit, réagit, choisit la table ; seul
//   le créateur retire ; un message ne se retire que par son auteur ; une signature fausse ne compte pas ;
// - une invitation ne porte jamais les messages, et ne vaut que si son auteur est membre et m'invite ;
// - sur un réseau d'essai HyperDHT en 127.0.0.1 : Alice crée un groupe et invite Bruno, qui accepte et
//   invite Chloé (son amie, pas celle d'Alice) ; Alice et Chloé se parlent par le groupe sans être amies ;
//   un message écrit pendant que Chloé est éteinte lui arrive à son retour ; Dora, hors du groupe, ne
//   reçoit rien ; le refus d'une invitation revient à qui l'a faite.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  groupView,
  invitationLines,
  isMember,
  parseGroupMessage,
  receiveInvitation,
  signGroupLine,
  tidyGroups,
  verifyGroupLine,
  weekEnd,
  newGroupsState,
  mergeGroupLines,
  createGroup,
  GROUP_LEFT_KEEP_DAYS,
  type GroupLine,
  type GroupsState,
  type GroupView,
} from '../groups';
import { newSocialState, setName, type SocialState } from '../social';

const T0 = new Date('2026-11-17T18:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const player = (name: string): SocialState => setName(newSocialState(T0), name)!;
const sign = (p: SocialState, g: string, body: Parameters<typeof signGroupLine>[2], min: number, id?: string) => signGroupLine({ key: p.key, name: p.name }, g, body, at(min), id)!;

test('groupes : la suite des lignes fait le groupe, et seuls les membres y comptent', () => {
  const alice = player('Alice');
  const bruno = player('Bruno');
  const chloe = player('Chloé');
  const dora = player('Dora');
  const G = '0123456789abcdef';
  const create = sign(alice, G, { k: 'create', name: '  Les   flippeurs du jeudi ' }, 0, G);
  assert.equal(create.body.k === 'create' && create.body.name, 'Les flippeurs du jeudi');
  const inviteB = sign(alice, G, { k: 'invite', who: bruno.key.publicKey, whoName: 'Bruno' }, 1);
  const joinB = sign(bruno, G, { k: 'join' }, 2);
  // Dora n'est pas membre : son invitation, son message, sa réaction ne comptent pas.
  const inviteByDora = sign(dora, G, { k: 'invite', who: chloe.key.publicKey, whoName: 'Chloé' }, 3);
  const msgDora = sign(dora, G, { k: 'msg', text: 'je ne suis pas là' }, 3);
  const inviteC = sign(bruno, G, { k: 'invite', who: chloe.key.publicKey, whoName: 'Chloé' }, 4);
  const msgB = sign(bruno, G, { k: 'msg', text: 'Qui bat mon 48 M ce soir ?' }, 5);
  // Chloé invitée mais pas encore arrivée : son message ne compte pas.
  const msgCearly = sign(chloe, G, { k: 'msg', text: 'trop tôt' }, 5);
  const joinC = sign(chloe, G, { k: 'join' }, 6);
  const reactC = sign(chloe, G, { k: 'react', target: msgB.id, kind: 'haha' }, 7);
  // Alice ne retire pas le message de Bruno ; Bruno le peut.
  const delByAlice = sign(alice, G, { k: 'del', target: msgB.id }, 8);
  const msgC = sign(chloe, G, { k: 'msg', text: 'Partie à trois à 22 h ?' }, 9);
  // Bruno n'est pas le créateur : il ne retire personne.
  const removeByBruno = sign(bruno, G, { k: 'remove', who: chloe.key.publicKey }, 10);
  const week = sign(bruno, G, { k: 'week', table: { title: 'Star Courier', manufacturer: 'Halcyon', year: 1987 }, until: weekEnd(at(10)).toISOString() }, 10);
  const lines = [create, inviteB, joinB, inviteByDora, msgDora, inviteC, msgB, msgCearly, joinC, reactC, delByAlice, msgC, removeByBruno, week];
  // L'ordre d'arrivée ne compte pas : seules les dates.
  const v = groupView([...lines].reverse(), at(11))!;
  assert.equal(v.name, 'Les flippeurs du jeudi');
  assert.equal(v.creator, alice.key.publicKey);
  assert.deepEqual(v.members.map((m) => m.name), ['Alice', 'Bruno', 'Chloé']);
  assert.equal(v.invited.length, 0);
  assert.deepEqual(v.messages.map((l) => (l.body.k === 'msg' ? l.body.text : '')), ['Qui bat mon 48 M ce soir ?', 'Partie à trois à 22 h ?']);
  assert.equal(v.reactions.get(msgB.id)?.get(chloe.key.publicKey), 'haha');
  assert.equal(v.week?.table.title, 'Star Courier');
  for (const bad of [inviteByDora, msgDora, msgCearly, delByAlice, removeByBruno]) assert.equal(v.valid.has(bad.id), false, `ligne comptée à tort : ${bad.body.k} de ${bad.name}`);

  // Bruno retire son message ; Alice (créatrice) retire Chloé ; Bruno part.
  const delB = sign(bruno, G, { k: 'del', target: msgB.id }, 12);
  const removeC = sign(alice, G, { k: 'remove', who: chloe.key.publicKey }, 13);
  const msgCafter = sign(chloe, G, { k: 'msg', text: 'encore moi' }, 14);
  const leaveB = sign(bruno, G, { k: 'leave' }, 15);
  const v2 = groupView([...lines, delB, removeC, msgCafter, leaveB], at(16))!;
  assert.deepEqual(v2.members.map((m) => m.name), ['Alice']);
  assert.deepEqual(v2.messages.map((l) => (l.body.k === 'msg' ? l.body.text : '')), ['Partie à trois à 22 h ?']);
  assert.equal(v2.reactions.has(msgB.id), false);
  assert.equal(v2.former.get(chloe.key.publicKey)?.how, 'removed');
  assert.equal(v2.former.get(bruno.key.publicKey)?.how, 'left');
  // La table de la semaine finie ne se montre plus.
  assert.equal(groupView(lines, new Date(Date.parse(week.body.k === 'week' ? week.body.until : '') + 1000))?.week, undefined);
  // Sans sa ligne de création, pas de groupe.
  assert.equal(groupView(lines.filter((l) => l !== create), at(11)), undefined);
});

test('groupes : signatures, forme des messages du réseau, invitation sans les messages', () => {
  const alice = player('Alice');
  const bruno = player('Bruno');
  const dora = player('Dora');
  const G = 'fedcba9876543210';
  const create = sign(alice, G, { k: 'create', name: 'Club' }, 0, G);
  const msg = sign(alice, G, { k: 'msg', text: 'Bonsoir' }, 1);
  assert.ok(verifyGroupLine(JSON.parse(JSON.stringify(msg)), at(2)));
  // Un texte retouché, un auteur changé, une date du futur : refusés.
  assert.equal(verifyGroupLine({ ...msg, body: { k: 'msg', text: 'Bonsoir !' } }, at(2)), undefined);
  assert.equal(verifyGroupLine({ ...msg, by: bruno.key.publicKey }, at(2)), undefined);
  assert.equal(verifyGroupLine(sign(alice, G, { k: 'msg', text: 'demain' }, 60 * 24), at(2)), undefined);
  // Texte vide ou trop long : rien n'est signé.
  assert.equal(signGroupLine({ key: alice.key, name: 'Alice' }, G, { k: 'msg', text: '   ' }, at(1)), undefined);
  assert.equal(signGroupLine({ key: alice.key, name: 'Alice' }, G, { k: 'msg', text: 'x'.repeat(501) }, at(1)), undefined);
  assert.equal(signGroupLine({ key: alice.key, name: 'Alice' }, G, { k: 'create', name: 'n'.repeat(33) }, at(1)), undefined);

  const inviteB = sign(alice, G, { k: 'invite', who: bruno.key.publicKey, whoName: 'Bruno' }, 2);
  const all = [create, msg, inviteB];
  const shown = invitationLines(all, at(3));
  assert.deepEqual(shown.map((l) => l.body.k), ['create', 'invite']);
  // L'invitation ne vaut que venue d'un membre, et pour moi.
  const s0 = newGroupsState();
  assert.equal(receiveInvitation(s0, dora.key.publicKey, shown, bruno.key.publicKey, at(3)).fresh, false);
  assert.equal(receiveInvitation(s0, alice.key.publicKey, shown, dora.key.publicKey, at(3)).fresh, false);
  const r = receiveInvitation(s0, alice.key.publicKey, shown, bruno.key.publicKey, at(3));
  assert.equal(r.fresh, true);
  assert.deepEqual(r.ack, [inviteB.id]);
  // Reçue deux fois : une seule invitation, accusée de nouveau.
  const again = receiveInvitation(r.state, alice.key.publicKey, shown, bruno.key.publicKey, at(4));
  assert.equal(again.fresh, false);
  assert.deepEqual(again.ack, [inviteB.id]);

  assert.deepEqual(parseGroupMessage({ t: 'grp-sum', g: G, h: '0123456789abcdef' }), { t: 'grp-sum', g: G, h: '0123456789abcdef' });
  assert.equal(parseGroupMessage({ t: 'grp-sum', g: 'pas-un-id', h: 'x' }), undefined);
  assert.equal(parseGroupMessage({ t: 'grp', lines: [] }), undefined);
  assert.equal(parseGroupMessage({ t: 'grp-have', g: G, ids: ['0123456789abcdef', 'mauvais'] })?.t, 'grp-have');
});

test('groupes : non-lus, groupe quitté effacé plus tard, fin de la table de la semaine', () => {
  const alice = player('Alice');
  const bruno = player('Bruno');
  const G = '00112233aabbccdd';
  const lines = [sign(alice, G, { k: 'create', name: 'Club' }, 0, G), sign(alice, G, { k: 'invite', who: bruno.key.publicKey, whoName: 'Bruno' }, 1), sign(bruno, G, { k: 'join' }, 2)];
  let s: GroupsState = createGroup(newGroupsState(), lines);
  const fromBruno = sign(bruno, G, { k: 'msg', text: 'Salut' }, 3);
  const r = mergeGroupLines(s, G, [fromBruno, fromBruno], alice.key.publicKey, at(4));
  assert.equal(r.fresh.length, 1);
  assert.equal(r.state.groups[G]!.unread, 1);
  s = r.state;
  // Retirée par… personne : Alice reste membre ; un groupe quitté s'efface passé le délai.
  const gone = { ...s, groups: { ...s.groups, [G]: { ...s.groups[G]!, gone: at(5).toISOString() } } };
  assert.ok(tidyGroups(gone, at(6)).groups[G]);
  assert.equal(tidyGroups(gone, new Date(at(5).getTime() + (GROUP_LEFT_KEEP_DAYS + 1) * 86_400_000)).groups[G], undefined);
  // Fin de la table de la semaine : un dimanche à 23:59, au moins deux jours plus tard.
  const friday = new Date(2026, 10, 20, 18, 0);
  const end = weekEnd(friday);
  assert.equal(end.getDay(), 0);
  assert.equal(end.getHours(), 23);
  assert.ok(end.getTime() - friday.getTime() >= 2 * 86_400_000);
  const v: GroupView = groupView(s.groups[G]!.lines, at(5))!;
  assert.equal(isMember(v, bruno.key.publicKey), true);
});

// ---------------------------------------------------------------------------
// Sur le réseau d'essai

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');
interface Net {
  state(): SocialState;
  online(key: string): boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  request(p: { key: string; name: string }): void;
  accept(key: string): void;
}
interface Groups {
  state(): GroupsState;
  view(g: string): GroupView | undefined;
  create(name: string, friends: { key: string; name: string }[]): string | undefined;
  invite(g: string, friends: { key: string; name: string }[]): number;
  send(g: string, text: string): { line: GroupLine } | { reason: string };
  accept(g: string): boolean;
  decline(g: string): boolean;
  observe(): void;
  stop(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const netModule = require(path.join(APP_DIST, 'social-net.js')) as { createSocialNet(o: object): Net };
const groupModule = require(path.join(APP_DIST, 'group-service.js')) as { createGroupService(o: object): Groups };
const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

async function until(what: string, check: () => boolean, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

function cabinet(name: string, bootstrap: { host: string; port: number }[]) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-groupes-${name}-`));
  const net = netModule.createSocialNet({ dataDir, mode: 'simulated', host: '127.0.0.1', bootstrap, graceMs: 400, searchMs: 1000 });
  assert.equal(net.rename(name), true);
  const arrived: string[] = [];
  const invites: string[] = [];
  const groups = groupModule.createGroupService({
    net,
    dataDir,
    syncMs: 1000,
    onArrive: (_v: GroupView, lines: GroupLine[]) => arrived.push(...lines.map((l) => (l.body.k === 'msg' ? l.body.text : ''))),
    onInvite: (_i: unknown, v: GroupView) => invites.push(v.name),
  });
  return { net, groups, arrived, invites, dataDir, key: () => net.state().key.publicKey };
}
const texts = (g: Groups, id: string) => (g.view(id)?.messages ?? []).map((l) => (l.body.k === 'msg' ? l.body.text : ''));

async function befriend(a: ReturnType<typeof cabinet>, b: ReturnType<typeof cabinet>): Promise<void> {
  a.net.request({ key: b.key(), name: b.net.state().name });
  await until(`demande de ${a.net.state().name} reçue`, () => b.net.state().incoming.some((r) => r.key === a.key()));
  b.net.accept(a.key());
  await until(`${a.net.state().name} et ${b.net.state().name} amis et reliés`, () => a.net.online(b.key()) && b.net.online(a.key()));
}

test('groupes sur le réseau : invitation, membres non amis, message remis au retour, refus', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const alice = cabinet('Alice', testnet.bootstrap);
  const bruno = cabinet('Bruno', testnet.bootstrap);
  const chloe = cabinet('Chloé', testnet.bootstrap);
  const dora = cabinet('Dora', testnet.bootstrap);
  const all = [alice, bruno, chloe, dora];
  // Le réseau change : les groupes le relèvent (dans l'application, socialChanged).
  const tick = setInterval(() => all.forEach((c) => c.groups.observe()), 200);
  try {
    await Promise.all(all.map((c) => c.net.start()));
    await befriend(alice, bruno);
    await befriend(bruno, chloe);
    await befriend(alice, dora);

    // Alice crée le groupe et invite Bruno ; Dora n'est invitée nulle part.
    const G = alice.groups.create('Les flippeurs du jeudi', [{ key: bruno.key(), name: 'Bruno' }])!;
    assert.ok(G);
    // Chloé n'est pas l'amie d'Alice : on ne peut pas l'inviter.
    assert.equal(alice.groups.invite(G, [{ key: chloe.key(), name: 'Chloé' }]), 0);
    assert.equal(alice.groups.send(G, 'Bienvenue au club').hasOwnProperty('line'), true);
    await until('invitation chez Bruno', () => bruno.invites.includes('Les flippeurs du jeudi'));
    // L'invitation ne montre pas les messages.
    assert.equal(bruno.groups.view(G), undefined);
    assert.equal(bruno.groups.accept(G), true);
    await until('Bruno membre chez Alice', () => !!alice.groups.view(G)?.members.some((m) => m.key === bruno.key()));
    await until('les messages d’avant chez Bruno', () => texts(bruno.groups, G).includes('Bienvenue au club'));

    // Bruno invite Chloé (son amie) ; elle accepte, et parle avec Alice sans être son amie.
    assert.equal(bruno.groups.invite(G, [{ key: chloe.key(), name: 'Chloé' }]), 1);
    await until('invitation chez Chloé', () => chloe.invites.includes('Les flippeurs du jeudi'));
    assert.equal(chloe.groups.accept(G), true);
    await until('Chloé membre chez Alice', () => !!alice.groups.view(G)?.members.some((m) => m.key === chloe.key()));
    await until('historique chez Chloé', () => texts(chloe.groups, G).includes('Bienvenue au club'));
    chloe.groups.send(G, 'Bonsoir Alice !');
    await until('message de Chloé chez Alice', () => texts(alice.groups, G).includes('Bonsoir Alice !'));
    assert.ok(alice.arrived.includes('Bonsoir Alice !'));

    // Chloé s'éteint ; Alice écrit ; Chloé le reçoit à son retour (d'Alice ou de Bruno).
    await chloe.net.stop();
    await new Promise((r) => setTimeout(r, 3100));
    alice.groups.send(G, 'Tu as raté la partie');
    await until('message d’Alice chez Bruno', () => texts(bruno.groups, G).includes('Tu as raté la partie'));
    await chloe.net.start();
    await until('remis à Chloé à son retour', () => texts(chloe.groups, G).includes('Tu as raté la partie'), 60_000);

    // Dora, hors du groupe, n'a rien reçu.
    assert.deepEqual(Object.keys(dora.groups.state().groups), []);

    // Un refus revient à qui a invité.
    alice.groups.invite(G, [{ key: dora.key(), name: 'Dora' }]);
    await until('invitation chez Dora', () => dora.invites.includes('Les flippeurs du jeudi'));
    assert.equal(dora.groups.decline(G), true);
    await until('refus de Dora chez Alice', () => !!alice.groups.view(G)?.declined.has(dora.key()));
    assert.equal(alice.groups.view(G)?.invited.length, 0);
  } finally {
    clearInterval(tick);
    for (const c of all) c.groups.stop();
    await Promise.all(all.map((c) => c.net.stop()));
    await testnet.destroy();
  }
});
