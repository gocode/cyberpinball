// Groupes et parties instantanées au téléphone, lot 4 (18/11/2026) : les messages du téléphone bornés
// par le cœur (group-act, instant-act) ; ce que la borne envoie (groups-menu.ts : remoteGroups, la tête
// d'un groupe ouvert ; instant-menu.ts : remote) et les gestes qu'elle vérifie (remoteAct), avec des
// services d'essai ; la page du téléphone servie avec son script. Le parcours dans la vraie page :
// la démonstration interne des Scores au téléphone (telecommande.test.ts).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { groupView, signGroupLine, weekEnd, type GroupLine, type GroupView } from '../groups';
import { parsePhoneMessage } from '../remote';
import { signScore } from '../rankings';
import { newSocialState, setName, type SocialState } from '../social';
import { fakeLiveGames, fakeSocialNet } from './doublures';
import { REPO_ROOT } from './i18n-scan';

const T0 = new Date('2026-11-18T19:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const player = (name: string): SocialState => setName(newSocialState(T0), name)!;
const sign = (p: SocialState, g: string, body: Parameters<typeof signGroupLine>[2], min: number, id?: string): GroupLine => signGroupLine({ key: p.key, name: p.name, country: 'FR' }, g, body, at(min), id)!;

test('groupes et parties au téléphone : group-act et instant-act bornés par le cœur', () => {
  const g = '0123456789abcdef';
  const key = 'a'.repeat(64);
  assert.deepEqual(parsePhoneMessage({ t: 'group-act', s: 2, a: 'accept', g }), { t: 'group-act', s: 2, a: 'accept', g });
  assert.deepEqual(parsePhoneMessage({ t: 'group-act', s: 2, a: 'invite', g, key }), { t: 'group-act', s: 2, a: 'invite', g, key });
  assert.deepEqual(parsePhoneMessage({ t: 'group-act', s: 2, a: 'create' }), { t: 'group-act', s: 2, a: 'create' });
  assert.equal(parsePhoneMessage({ t: 'group-act', s: 2, a: 'create', g }), undefined, 'créer : sans groupe');
  assert.equal(parsePhoneMessage({ t: 'group-act', s: 2, a: 'leave' }), undefined, 'quitter : un groupe');
  assert.equal(parsePhoneMessage({ t: 'group-act', s: 2, a: 'invite', g }), undefined, 'inviter : un ami');
  assert.equal(parsePhoneMessage({ t: 'group-act', s: 2, a: 'leave', g, key }), undefined, 'un ami seulement pour inviter');
  assert.equal(parsePhoneMessage({ t: 'group-act', s: 2, a: 'supprimer', g }), undefined, 'un geste inconnu');
  assert.equal(parsePhoneMessage({ t: 'group-act', s: 2, a: 'join', g: '../x' }), undefined);
  assert.deepEqual(parsePhoneMessage({ t: 'instant-act', s: 3, a: 'join', id: g }), { t: 'instant-act', s: 3, a: 'join', id: g });
  assert.deepEqual(parsePhoneMessage({ t: 'instant-act', s: 3, a: 'open', count: 3 }), { t: 'instant-act', s: 3, a: 'open', count: 3 }, 'ouvrir : la table de la borne');
  assert.deepEqual(parsePhoneMessage({ t: 'instant-act', s: 3, a: 'open', count: 4, table: g }), { t: 'instant-act', s: 3, a: 'open', count: 4, table: g });
  assert.equal(parsePhoneMessage({ t: 'instant-act', s: 3, a: 'open', count: 5 }), undefined, '2 à 4 joueurs');
  assert.equal(parsePhoneMessage({ t: 'instant-act', s: 3, a: 'open', count: 2, table: 'C:\\Tables\\x.vpx' }), undefined, 'jamais un chemin');
  assert.deepEqual(parsePhoneMessage({ t: 'instant-act', s: 3, a: 'invite', key }), { t: 'instant-act', s: 3, a: 'invite', key });
  assert.deepEqual(parsePhoneMessage({ t: 'instant-act', s: 3, a: 'cancel' }), { t: 'instant-act', s: 3, a: 'cancel' });
  assert.equal(parsePhoneMessage({ t: 'instant-act', s: 3, a: 'cancel', id: g }), undefined);
  assert.equal(parsePhoneMessage({ t: 'instant-act', s: 3, a: 'join' }), undefined);
});

/* eslint-disable @typescript-eslint/no-require-imports */
type Remote = { rows: unknown[]; unread: number; thread?: { items: { kind: string; author?: string; meta?: string }[]; group?: Record<string, unknown> & { ranking: { name: string; me?: true }[]; members: { name: string }[]; invitable: { key: string; name: string }[]; inviteReason?: string; week?: { title: string; reason?: string } } } };
const { createGroupsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'groups-menu.js')) as {
  createGroupsMenu(host: object): {
    remote(open?: string): Remote;
    remoteGroups(): { blocked?: string; create: { reason?: string }; invitations: { g: string; name: string; detail: string }[]; publics: { g: string; name: string; member?: true; reason?: string; preview: string[] }[]; notice?: { text: string } };
    remoteAct(act: string, g: string | undefined, key: string | undefined, back: () => void): void;
  };
};
const { createInstantMenu, instantTableRef } = require(path.join(REPO_ROOT, 'app', 'dist', 'instant-menu.js')) as {
  createInstantMenu(host: object): {
    remote(): {
      blocked?: string;
      games: { id: string; join?: true; reason?: string }[];
      open?: { reason?: string; table?: { ref: string; title: string }; tables?: { ref: string; title: string }[] };
      mine?: { seats: { name: string }[]; max: number; host: boolean; invitable: { key: string }[]; inviteReason?: string; closes: string };
    };
    remoteAct(act: string, opts: object, to: () => void): void;
  };
  instantTableRef(table: { file: string }): string;
};
/* eslint-enable @typescript-eslint/no-require-imports */

function groupsHarness() {
  const me = player('Camille');
  const kiko = player('Kiko');
  const lena = player('Lena');
  const nova = player('Nova');
  const bruno = player('Bruno');
  const MINE = '1111111111111111';
  const PUB = '2222222222222222';
  const INV = '3333333333333333';
  const FULL = '4444444444444444';
  const until = weekEnd(at(1)).toISOString();
  const mineLines = [
    sign(me, MINE, { k: 'create', name: 'Nuits néon', access: 'public' }, 0, MINE),
    sign(me, MINE, { k: 'invite', who: kiko.key.publicKey, whoName: 'Kiko' }, 1),
    sign(kiko, MINE, { k: 'join' }, 2),
    sign(kiko, MINE, { k: 'week', table: { title: 'Star Courier', manufacturer: 'Halcyon', year: 1987 }, until }, 3),
    sign(kiko, MINE, { k: 'msg', text: 'Je tente le multibille ce soir' }, 4),
    sign(me, MINE, { k: 'msg', text: 'Je reprends la première place' }, 5),
  ];
  const view = (lines: GroupLine[]) => groupView(lines, at(10))!;
  const mine = new Map<string, { entry: { lines: GroupLine[]; unread: number; muted?: true }; view: GroupView }>([[MINE, { entry: { lines: mineLines, unread: 1 }, view: view(mineLines) }]]);
  const pub = view([sign(lena, PUB, { k: 'create', name: 'Club Bally', access: 'public' }, 0, PUB)]);
  // Un groupe public plein (GROUP_MEMBERS_MAX : 20 membres) : « Rejoindre » grisé avec sa raison.
  const crowd = Array.from({ length: 19 }, (_, i) => player(`Joueur ${i}`));
  const fullLines = [sign(lena, FULL, { k: 'create', name: 'Complet', access: 'public' }, 0, FULL), ...crowd.flatMap((p, i) => [sign(lena, FULL, { k: 'invite', who: p.key.publicKey, whoName: p.name }, 1 + i), sign(p, FULL, { k: 'join' }, 2 + i)])];
  const invLines = [sign(nova, INV, { k: 'create', name: 'Les Lève-tôt' }, 0, INV), sign(nova, INV, { k: 'invite', who: me.key.publicKey, whoName: 'Camille' }, 1)];
  let invitations = [{ invitation: { g: INV, from: nova.key.publicKey, arrived: at(1).toISOString(), lines: invLines }, view: view(invLines) }];
  const calls: string[] = [];
  let enabled = true;
  const scores = [
    signScore(kiko.key, { name: 'Kiko', country: 'FR', board: 'b'.repeat(64), balls: 3, table: { title: 'Star Courier' }, score: 412_300_000, at: at(6).toISOString(), how: 'rom' }),
    signScore(me.key, { name: 'Camille', country: 'FR', board: 'b'.repeat(64), balls: 3, table: { title: 'Star Courier' }, score: 388_950_000, at: at(7).toISOString(), how: 'rom' }),
  ];
  const groups = {
    groups: () => [...mine.values()],
    invitations: () => invitations,
    publicGroups: () => [{ view: pub }, { view: view(fullLines) }],
    view: (g: string) => mine.get(g)?.view,
    entry: (g: string) => mine.get(g)?.entry,
    markRead: () => undefined,
    typers: () => [],
    askDirectory: () => void calls.push('directory'),
    joinPublic: (g: string) => (calls.push(`join:${g[0]}`), true),
    accept: (g: string) => (calls.push(`accept:${g[0]}`), (invitations = []), true),
    decline: (g: string) => (calls.push(`decline:${g[0]}`), true),
    invite: (g: string, friends: { name: string }[]) => (calls.push(`invite:${g[0]}:${friends.map((f) => f.name).join(',')}`), friends.length),
    leave: (g: string) => (calls.push(`leave:${g[0]}`), true),
    setMuted: (g: string, on: boolean) => void calls.push(`mute:${g[0]}:${on}`),
  };
  const net = fakeSocialNet({
    state: () => ({ enabled, name: 'Camille', key: { publicKey: me.key.publicKey }, friends: [{ key: kiko.key.publicKey, name: 'Kiko' }, { key: bruno.key.publicKey, name: 'Bruno' }] }),
    online: (key: string) => key === bruno.key.publicKey,
    reachable: () => false,
    presenceOf: () => undefined,
    avatarFile: () => undefined,
    rankings: () => ({ scores, hidden: [] }),
    livePlayers: () => [],
    rooms: () => ({ filter: false }),
    report: () => undefined,
  });
  const opened: string[] = [];
  let busy: string | undefined;
  const menu = createGroupsMenu({
    library: { openCustom: (build: () => { heading: string }) => opened.push(build().heading), isShowing: () => false, openPrompt: () => undefined },
    net,
    groups,
    tables: () => [{ title: 'Star Courier', file: 'C:\\Tables\\Star Courier.vpx', emulator: 'vpx', info: {} }],
    play: (table: { title: string }) => calls.push(`play:${table.title}`),
    busy: () => busy,
    now: () => at(10),
  });
  return { menu, calls, opened, ids: { MINE, PUB, INV, FULL }, keys: { kiko: kiko.key.publicKey, bruno: bruno.key.publicKey }, off: () => (enabled = false), setBusy: (b: string | undefined) => (busy = b), mute: () => (mine.get(MINE)!.entry.muted = true) };
}

test('groupes au téléphone : créer, les invitations reçues, les groupes publics (les miens « Déjà membre »)', () => {
  const h = groupsHarness();
  const g = h.menu.remoteGroups();
  assert.equal(g.create.reason, undefined, 'créer un groupe : possible');
  assert.deepEqual(g.invitations.map((i) => i.name), ['Les Lève-tôt']);
  assert.ok(g.invitations[0]!.detail.includes('Nova'), 'qui invite');
  assert.deepEqual(g.publics.map((p) => p.name), ['Club Bally', 'Complet', 'Nuits néon'], 'l’annuaire, puis mes groupes publics');
  assert.equal(g.publics.find((p) => p.name === 'Nuits néon')?.member, true, 'mon groupe : « Déjà membre »');
  assert.ok(g.publics.find((p) => p.name === 'Complet')?.reason, 'un groupe plein : grisé avec sa raison');
  assert.ok(g.publics.find((p) => p.name === 'Club Bally')!.preview.some((l) => l.startsWith('Lena')), 'l’aperçu : ses membres');
  h.setBusy('Pendant une partie');
  assert.equal(h.menu.remoteGroups().create.reason, 'Pendant une partie', 'pendant une partie : créer est grisé avec sa raison');
  h.off();
  const off = h.menu.remoteGroups();
  assert.ok(off.blocked && off.create.reason && !off.invitations.length && !off.publics.length, 'partage coupé : rien, et pourquoi');
});

test('groupes au téléphone : un groupe ouvert, sa table de la semaine, son classement, l’auteur de chaque message', () => {
  const h = groupsHarness();
  const r = h.menu.remote(`g:${h.ids.MINE}`);
  const head = r.thread?.group;
  assert.ok(head, 'la tête du groupe part avec son fil');
  assert.equal(head.week?.title, 'Star Courier');
  assert.equal(head.week?.reason, undefined, 'la table est dans la borne : « Jouer »');
  assert.deepEqual(head.ranking.map((x) => x.name), ['Kiko', 'Vous']);
  assert.equal(head.ranking[1]?.me, true);
  assert.deepEqual(head.members.map((m) => m.name), ['Camille', 'Kiko']);
  assert.deepEqual(head.invitable.map((f) => f.name), ['Bruno'], 'les amis pas encore membres');
  const lines = r.thread!.items.filter((it) => it.kind === 'line');
  assert.deepEqual(lines.map((l) => l.author), ['Kiko', undefined], 'l’auteur au-dessus d’un message reçu, pas du mien');
  assert.ok(lines.every((l) => !l.meta?.includes('Kiko')), 'l’heure seule sous la bulle');
  h.setBusy('Pendant une partie');
  assert.equal(h.menu.remote(`g:${h.ids.MINE}`).thread?.group?.week?.reason, 'Pendant une partie', '« Jouer » grisé pendant une partie');
});

test('groupes au téléphone : chaque geste vérifié par la borne', () => {
  const h = groupsHarness();
  const back = () => undefined;
  const { MINE, PUB, INV, FULL } = h.ids;
  h.menu.remoteAct('accept', MINE, undefined, back);
  h.menu.remoteAct('join', MINE, undefined, back);
  h.menu.remoteAct('join', FULL, undefined, back);
  h.menu.remoteAct('leave', PUB, undefined, back);
  h.menu.remoteAct('invite', MINE, h.keys.kiko, back);
  assert.deepEqual(h.calls, [], 'pas d’invitation à ce groupe, déjà membre, groupe plein, pas membre, déjà membre : rien');
  h.menu.remoteAct('join', PUB, undefined, back);
  h.menu.remoteAct('invite', MINE, h.keys.bruno, back);
  h.menu.remoteAct('mute', MINE, undefined, back);
  h.menu.remoteAct('play', MINE, undefined, back);
  h.menu.remoteAct('directory', undefined, undefined, back);
  h.menu.remoteAct('accept', INV, undefined, back);
  assert.deepEqual(h.calls, ['join:2', 'invite:1:Bruno', 'mute:1:true', 'play:Star Courier', 'directory', 'accept:3']);
  assert.ok(h.menu.remoteGroups().notice?.text.includes('Les Lève-tôt'), 'le constat du dernier geste part au téléphone');
  h.calls.length = 0;
  h.menu.remoteAct('create', undefined, undefined, back);
  assert.deepEqual(h.opened.slice(-2), ['Groupes', 'Créer un groupe'], 'créer : « Créer un groupe » s’ouvre à la borne, la liste derrière');
  h.setBusy('Pendant une partie');
  const before = h.opened.length;
  h.menu.remoteAct('create', undefined, undefined, back);
  h.menu.remoteAct('play', MINE, undefined, back);
  assert.equal(h.opened.length, before, 'pendant une partie : aucun écran ne s’ouvre');
  assert.deepEqual(h.calls, [], 'ni table lancée');
  h.menu.remoteAct('leave', MINE, undefined, back);
  assert.deepEqual(h.calls, ['leave:1'], 'quitter, lui, reste possible');
});

function instantHarness() {
  const ME = 'a'.repeat(64);
  const KIKO = 'b'.repeat(64);
  const BRUNO = 'c'.repeat(64);
  const SAME = '5555555555555555';
  const OTHER = '6666666666666666';
  const tables = [
    { title: 'Neon Abyss', manufacturer: 'Cyber Pinball', year: 2026, file: 'C:\\Tables\\Neon Abyss.vpx', emulator: 'vpx' },
    { title: 'Orbite Basse', file: 'C:\\Tables\\Orbite Basse.vpx', emulator: 'vpx' },
    { title: 'Marée Haute', file: 'C:\\Tables\\Marée Haute.pxp', emulator: 'pinballfx' },
  ];
  const announce = (id: string, title: string, key: string, name: string) => ({ id, key, name, title, table: { title }, max: 3, seats: [{ key, name }], state: 'open', opened: at(-3).toISOString(), at: at(0).toISOString(), sig: 'x' });
  let current: object | undefined;
  const calls: string[] = [];
  const games = fakeLiveGames({
    current: () => current,
    instantGames: () => [announce(SAME, 'Neon Abyss', KIKO, 'Kiko'), announce(OTHER, 'Orbite Basse', BRUNO, 'Bruno')],
    matchFor: async (invite: { id: string }) => ({ match: invite.id === SAME ? 'same' : 'differs' }),
    joinInstant: async () => (calls.push('join'), { match: 'same' }),
    openInstant: async (table: { title: string }, max: number) => void calls.push(`open:${table.title}:${max}`),
    invite: (key: string) => (calls.push(`invite:${key[0]}`), true),
    leave: () => void calls.push('leave'),
    close: () => undefined,
  });
  let busy: string | undefined;
  const menu = createInstantMenu({
    library: { openCustom: () => undefined, task: async (_: string, work: () => Promise<void>) => work() },
    net: fakeSocialNet({ state: () => ({ enabled: true, key: { publicKey: ME }, friends: [{ key: KIKO, name: 'Kiko' }, { key: BRUNO, name: 'Bruno' }] }), status: () => ({ running: true }), avatarFile: () => undefined, online: (k: string) => k === BRUNO }),
    games,
    live: { open: () => undefined },
    tables: () => tables,
    selected: () => tables[0],
    busy: () => busy,
    openSharing: () => undefined,
    redraw: () => undefined,
    now: () => at(0),
  });
  const host = (players: object[]) => (current = { id: '7777777777777777', host: ME, title: 'Neon Abyss', table: { title: 'Neon Abyss' }, players, phase: 'lobby', createdAt: at(-4).toISOString(), instant: { max: 3, opened: at(-4).toISOString() } });
  return { menu, calls, tables, ids: { SAME, OTHER }, keys: { ME, KIKO, BRUNO }, host, setBusy: (b: string | undefined) => (busy = b) };
}

test('parties instantanées au téléphone : rejoindre (ou pourquoi pas), ouvrir sur la table de la borne, ma partie', async () => {
  const h = instantHarness();
  h.menu.remote();
  // La vérification de la table chez moi arrive après coup (matchFor).
  await new Promise((r) => setImmediate(r));
  const r = h.menu.remote();
  assert.deepEqual(r.games.map((g) => [g.join === true, Boolean(g.reason)]), [[true, false], [false, true]], 'même version : Rejoindre ; autre version : grisée avec sa raison');
  assert.equal(r.open?.table?.title, 'Neon Abyss (Cyber Pinball 2026)', 'ouvrir : la table choisie à la borne');
  assert.equal(r.open?.table?.ref, instantTableRef(h.tables[0]!));
  assert.ok(!JSON.stringify(r).includes('C:\\\\'), 'jamais le chemin d’une table');
  assert.equal(r.open?.tables, undefined, 'la liste des tables seulement sur demande');
  h.menu.remoteAct('tables', {}, () => undefined);
  assert.deepEqual(h.menu.remote().open?.tables?.map((x) => x.title), ['Neon Abyss (Cyber Pinball 2026)', 'Orbite Basse'], '« Changer » : les tables VPX seulement');
  h.menu.remoteAct('join', { id: h.ids.OTHER }, () => undefined);
  h.menu.remoteAct('open', { table: instantTableRef(h.tables[2]!), count: 3 }, () => undefined);
  h.menu.remoteAct('open', { table: 'ffffffffffffffff', count: 3 }, () => undefined);
  h.setBusy('Pendant une partie');
  h.menu.remoteAct('join', { id: h.ids.SAME }, () => undefined);
  assert.ok(h.menu.remote().games.every((g) => g.reason === 'Pendant une partie'), 'pendant une partie : grisées avec la raison');
  h.setBusy(undefined);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(h.calls, [], 'autre version, table Pinball FX, table inconnue, pendant une partie : rien');
  h.menu.remoteAct('join', { id: h.ids.SAME }, () => undefined);
  h.menu.remoteAct('open', { table: instantTableRef(h.tables[1]!), count: 4 }, () => undefined);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(h.calls, ['join', 'open:Orbite Basse:4']);
  h.calls.length = 0;
  h.host([{ key: h.keys.ME, name: 'Camille', state: 'accepted', host: true }, { key: h.keys.KIKO, name: 'Kiko', state: 'accepted' }]);
  const mine = h.menu.remote().mine;
  assert.deepEqual(mine?.seats.map((s) => s.name), ['Vous', 'Kiko']);
  assert.equal(mine?.max, 3);
  assert.ok(mine?.closes.includes(':'), 'l’heure de fermeture');
  assert.deepEqual(mine?.invitable.map((f) => f.key), [h.keys.BRUNO], 'inviter : mes amis en ligne, pas déjà là');
  assert.equal(h.menu.remote().open, undefined, 'ma partie ouverte : pas d’autre à ouvrir');
  h.menu.remoteAct('invite', { key: h.keys.KIKO }, () => undefined);
  h.menu.remoteAct('open', { count: 2 }, () => undefined);
  h.menu.remoteAct('invite', { key: h.keys.BRUNO }, () => undefined);
  h.menu.remoteAct('cancel', {}, () => undefined);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(h.calls, ['invite:c', 'leave'], 'Kiko déjà dans la partie, une seconde partie : rien');
});

test('parties instantanées au téléphone : la page, son script servi par la borne', () => {
  const page = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone.html'), 'utf8');
  const script = (name: string) => page.indexOf(`<script src="${name}"></script>`);
  assert.ok(script('telephone-community.js') > -1 && script('telephone-community.js') < script('telephone-groupes.js') && script('telephone-groupes.js') < script('telephone.js'), 'telephone-groupes.js après la Communauté, avant telephone.js');
  const remote = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'phone-remote.ts'), 'utf8');
  assert.match(remote, /'\/telephone-groupes\.js': 'telephone\/telephone-groupes\.js'/, 'servi au téléphone');
  // Un identifiant ou une classe de section en double cache une partie de la page (18/11/2026 : une section
  // « page » plein écran masquait le titre de la barre du haut, déjà « page »).
  const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'chaque identifiant de la page du téléphone une seule fois');
  const sections = [...page.matchAll(/<section class="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections.filter((c, i) => sections.indexOf(c) !== i), [], 'chaque section de la page a sa propre classe');
});
