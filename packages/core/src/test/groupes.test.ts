// Groupes, publics ou privés (groups.ts, et app/src/group-service.ts compilé) :
// - la suite des lignes fait le groupe : seul un membre invite, écrit, réagit, choisit la table ; seul
//   le créateur retire ; un message ne se retire que par son auteur ; une signature fausse ne compte pas ;
// - une invitation ne porte jamais les messages, et ne vaut que si son auteur est membre et m'invite ;
// - un groupe public se rejoint sans invitation, sauf par un membre retiré ; son annonce, signée par un
//   membre, ne porte pas les messages ; redevenu privé, il quitte l'annuaire ; un groupe privé n'y entre
//   jamais ; sur le réseau d'essai, une inconnue le trouve dans l'annuaire, le rejoint et y parle ;
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
  signAnnounce,
  verifyAnnounce,
  mergeAnnounces,
  publicGroups,
  playerPublicGroups,
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

test('groupes publics : arrivée sans invitation, membre retiré, annonce et annuaire', () => {
  const alice = player('Alice');
  const bruno = player('Bruno');
  const chloe = player('Chloé');
  const G = 'abcdef0123456789';
  const P = '9876543210fedcba';
  const pub = [sign(alice, G, { k: 'create', name: 'Club ouvert', access: 'public' }, 0, G)];
  const joinB = sign(bruno, G, { k: 'join' }, 1);
  const msgB = sign(bruno, G, { k: 'msg', text: 'Salut tout le monde' }, 2);
  let v = groupView([...pub, joinB, msgB], at(3))!;
  assert.equal(v.access, 'public');
  assert.deepEqual(v.members.map((m) => m.name), ['Alice', 'Bruno']);
  assert.equal(v.messages.length, 1);
  // Retiré par la créatrice : il ne revient pas de lui-même ; une invitation le laisse revenir.
  const removeB = sign(alice, G, { k: 'remove', who: bruno.key.publicKey }, 4);
  const rejoinB = sign(bruno, G, { k: 'join' }, 5);
  v = groupView([...pub, joinB, msgB, removeB, rejoinB], at(6))!;
  assert.equal(isMember(v, bruno.key.publicKey), false);
  const inviteB = sign(alice, G, { k: 'invite', who: bruno.key.publicKey, whoName: 'Bruno' }, 7);
  const backB = sign(bruno, G, { k: 'join' }, 8);
  assert.equal(isMember(groupView([...pub, joinB, msgB, removeB, rejoinB, inviteB, backB], at(9))!, bruno.key.publicKey), true);
  // Un groupe privé ne se rejoint pas sans invitation ; seul le créateur change l'accès.
  const priv = [sign(alice, P, { k: 'create', name: 'Club fermé' }, 0, P)];
  assert.equal(isMember(groupView([...priv, sign(chloe, P, { k: 'join' }, 1)], at(2))!, chloe.key.publicKey), false);
  const openByBruno = sign(bruno, G, { k: 'access', access: 'private' }, 10);
  assert.equal(groupView([...pub, joinB, openByBruno], at(11))!.access, 'public');

  // L'annonce : signée par un membre, sans les messages ; vérifiée, elle entre dans l'annuaire.
  const lines = [...pub, joinB, msgB];
  const a = signAnnounce({ key: bruno.key }, lines, at(3))!;
  assert.ok(a);
  assert.equal(a.lines.some((l) => l.body.k === 'msg'), false);
  assert.ok(verifyAnnounce(JSON.parse(JSON.stringify(a)), at(4)));
  // Retouchée, ou annoncée par un non-membre : refusée.
  assert.equal(verifyAnnounce({ ...a, at: at(5).toISOString() }, at(6)), undefined);
  assert.equal(signAnnounce({ key: chloe.key }, lines, at(3)), undefined);
  // Un groupe privé ne s'annonce jamais.
  assert.equal(signAnnounce({ key: alice.key }, priv, at(1)), undefined);
  let s = mergeAnnounces(newGroupsState(), [a], at(4)).state;
  assert.deepEqual(publicGroups(s, chloe.key.publicKey, at(4)).map((x) => x.view.name), ['Club ouvert']);
  // Pas pour ses membres : il est déjà dans « Mes groupes ».
  assert.deepEqual(publicGroups(s, bruno.key.publicKey, at(4)), []);
  // Redevenu privé : la dernière annonce le retire de l'annuaire.
  const close = sign(alice, G, { k: 'access', access: 'private' }, 10);
  const last = signAnnounce({ key: alice.key }, [...lines, close], at(11))!;
  assert.ok(last);
  s = mergeAnnounces(s, [last], at(12)).state;
  assert.deepEqual(publicGroups(s, chloe.key.publicKey, at(12)), []);
  // Une annonce plus ancienne ne le fait pas revenir.
  assert.equal(mergeAnnounces(s, [a], at(13)).fresh.length, 0);
  assert.deepEqual(parseGroupMessage({ t: 'grp-pub-ask' }), { t: 'grp-pub-ask' });
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
  create(name: string, friends: { key: string; name: string }[], access?: 'public' | 'private'): string | undefined;
  invite(g: string, friends: { key: string; name: string }[]): number;
  setAccess(g: string, access: 'public' | 'private'): boolean;
  publicGroups(): { view: GroupView }[];
  joinPublic(g: string): boolean;
  askDirectory(): void;
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

test('groupes publics sur le réseau : trouvé par une inconnue, rejoint, fermé, jamais un groupe privé', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const alice = cabinet('Alice', testnet.bootstrap);
  const eve = cabinet('Eve', testnet.bootstrap);
  const dora = cabinet('Dora', testnet.bootstrap);
  const all = [alice, eve, dora];
  const tick = setInterval(() => all.forEach((c) => c.groups.observe()), 200);
  try {
    await Promise.all(all.map((c) => c.net.start()));
    // Aucune amitié : seul l'annuaire des groupes publics les rapproche.
    const G = alice.groups.create('Club ouvert', [], 'public')!;
    const P = alice.groups.create('Club fermé', [])!;
    alice.groups.send(G, 'Bienvenue à tous');
    const listed = (c: ReturnType<typeof cabinet>) => c.groups.publicGroups().map((x) => x.view.name);
    await until('le groupe public chez Eve et Dora', () => (eve.groups.askDirectory(), dora.groups.askDirectory(), listed(eve).includes('Club ouvert') && listed(dora).includes('Club ouvert')), 60_000);
    // Le groupe privé n'est nulle part.
    assert.equal(listed(eve).includes('Club fermé'), false);
    assert.equal(Object.keys(eve.groups.state().directory).includes(P), false);

    // Eve le rejoint : Alice la compte parmi les membres, l'historique lui arrive, elles se parlent.
    assert.equal(eve.groups.joinPublic(G), true);
    await until('Eve membre chez Alice', () => !!alice.groups.view(G)?.members.some((m) => m.key === eve.key()), 60_000);
    await until('historique chez Eve', () => texts(eve.groups, G).includes('Bienvenue à tous'));
    eve.groups.send(G, 'Merci Alice !');
    await until('message d’Eve chez Alice', () => texts(alice.groups, G).includes('Merci Alice !'));

    // Alice le ferme : il quitte l'annuaire de Dora ; Eve reste membre.
    assert.equal(alice.groups.setAccess(G, 'private'), true);
    await until('retiré de l’annuaire de Dora', () => !listed(dora).includes('Club ouvert'), 60_000);
    assert.equal(!!eve.groups.view(G)?.members.some((m) => m.key === eve.key()), true);
    // Fermé, il ne se rejoint plus sans invitation.
    assert.equal(dora.groups.joinPublic(G), false);
  } finally {
    clearInterval(tick);
    for (const c of all) c.groups.stop();
    await Promise.all(all.map((c) => c.net.stop()));
    await testnet.destroy();
  }
});

test('profil public : les groupes publics d’un joueur, jamais un groupe privé (17/11/2026)', () => {
  const alice = player('Alice');
  const bruno = player('Bruno');
  const chloe = player('Chloé');
  const G = 'abcdef0123456789';
  const H = '0123456789abcdef';
  const P = '9876543210fedcba';
  // Un groupe public de l'annuaire, dont Bruno est membre et pas moi (Chloé).
  const pub = [sign(alice, G, { k: 'create', name: 'Club ouvert', access: 'public' }, 0, G), sign(bruno, G, { k: 'join' }, 1)];
  const announce = signAnnounce({ key: alice.key }, pub, at(2))!;
  // Un groupe public dont nous sommes membres tous les deux, sur ma borne.
  const both = [sign(chloe, H, { k: 'create', name: 'Tilt du samedi', access: 'public' }, 0, H), sign(bruno, H, { k: 'join' }, 1)];
  // Un groupe privé dont il est membre : jamais sur son profil.
  const priv = [sign(chloe, P, { k: 'create', name: 'Club fermé' }, 0, P), sign(chloe, P, { k: 'invite', who: bruno.key.publicKey, whoName: 'Bruno' }, 1), sign(bruno, P, { k: 'join' }, 2)];
  assert.equal(isMember(groupView(priv, at(3))!, bruno.key.publicKey), true);
  const s: GroupsState = { ...newGroupsState(), groups: { [H]: { lines: both, unread: 0 }, [P]: { lines: priv, unread: 0 } }, directory: { [G]: announce } };
  const seen = playerPublicGroups(s, bruno.key.publicKey, chloe.key.publicKey, at(4));
  assert.deepEqual(seen.map((g) => [g.view.name, g.mine]).sort(), [['Club ouvert', false], ['Tilt du samedi', true]]);
  assert.deepEqual(playerPublicGroups(s, alice.key.publicKey, chloe.key.publicKey, at(4)).map((g) => g.view.name), ['Club ouvert']);
  // Redevenu privé : il quitte le profil.
  const closed = { ...s, groups: { ...s.groups, [H]: { lines: [...both, sign(chloe, H, { k: 'access', access: 'private' }, 3)], unread: 0 } } };
  assert.deepEqual(playerPublicGroups(closed, bruno.key.publicKey, chloe.key.publicKey, at(4)).map((g) => g.view.name), ['Club ouvert']);
  // Le profil branché : section « Groupes publics », Start ouvre le groupe ou sa page de l'annuaire.
  const profile = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'profile-menu.ts'), 'utf8');
  assert.match(profile, /title: t\('Groupes publics'\)/);
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /groupService\.publicGroupsOf\(key\)/);
  assert.match(front, /mine \? groupsMenu\.openGroup\(id, back\) : groupsMenu\.openPublic\(id, back\)/);
});
