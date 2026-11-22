// Le profil d'un joueur en profil de réseau social (22/11/2026, planche validée : « Page profil ok »).
// Ces tests fixent :
// - un seul écran à onglets, le même pour tout joueur et pour moi : l'en-tête du joueur à la place du
//   médaillon, quatre onglets Activité · Records · Badges · À propos (jamais d'onglet Amis : la carte
//   publique ne donne que le nombre d'amis) ;
// - les actions de la relation dans l'en-tête, la principale d'abord et le curseur dessus à l'ouverture ;
//   une action indisponible reste visible, grisée, avec sa raison courte, et n'est jamais un arrêt ;
// - le « J'aime » au pouce, Start sur une publication l'aime ou ne l'aime plus ;
// - Records : ses scores publiés, d'abord là où il me devance (le plus petit écart d'abord) ;
// - les actions rares (masquer, bloquer) en lignes de menu au bas d'À propos ;
// - mon profil : Modifier mon profil, Confidentialité, Mon compte ; Start sur une publication dit qui l'a aimée.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { playerRecords } from '../arena';
import { emptyRankings, type RankedScore } from '../rankings';
import { newSocialState } from '../social';
import { setLanguage } from '../i18n';
import { fakeSocialNet } from './doublures';
import { REPO_ROOT } from './i18n-scan';

setLanguage('fr');

const NOW = new Date('2026-11-22T20:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const ME = 'a'.repeat(64);
const THEO = 'b'.repeat(64);
const BOARD = (c: string) => `${c.repeat(64)}:`;

function score(key: string, board: string, value: number, title = 'Thunder Reef'): RankedScore {
  return { key, name: key === ME ? 'Kiko' : 'Théo', board, table: { title }, score: value, at: ago(60), how: 'rom', sig: '' } as RankedScore;
}

test('Records : ses scores publiés, d’abord là où il me devance (le plus petit écart), puis là où je mène, puis les autres', () => {
  const store = {
    ...emptyRankings(),
    scores: [
      score(THEO, BOARD('1'), 1_000, 'Gros écart'),
      score(ME, BOARD('1'), 100, 'Gros écart'),
      score(THEO, BOARD('2'), 500, 'Petit écart'),
      score(ME, BOARD('2'), 450, 'Petit écart'),
      score(THEO, BOARD('3'), 300, 'Je mène'),
      score(ME, BOARD('3'), 900, 'Je mène'),
      score(THEO, BOARD('4'), 50, 'Pas chez moi'),
    ],
  };
  const list = playerRecords(store, THEO, ME);
  assert.deepEqual(
    list.map((r) => r.table.title),
    ['Petit écart', 'Gros écart', 'Je mène', 'Pas chez moi'],
  );
  assert.equal(list[0]!.mine, 450);
  assert.equal(list[2]!.rank, 2, 'sa place sur cette version');
  assert.equal(list[3]!.mine, undefined, 'rien publié de mon côté');
  // Mes propres records : jamais comparés à moi-même.
  assert.ok(playerRecords(store, ME, ME).every((r) => r.mine === undefined));
});

interface Hub {
  person: { name: string; eyebrow?: string; status?: { text: string }; buttons: { label: string; off?: string; primary?: boolean; xp?: string; action?: number }[] };
  tabs: { label: string; current: boolean; disabled?: string }[];
  sections: { title?: string; cards: { key?: string; title: string; readOnly?: boolean; detail?: string; aside?: string; asideIcon?: string; asideTone?: string; action?: number }[]; choices?: { title: string; action?: number }[] }[];
}
interface Built {
  heading: string;
  hub: Hub;
  hint?: string;
  keys?(input: { code: string }): boolean;
  actions: { label: string; key?: string; run(): void }[];
  back(): void;
}

function profile(opts: { friend?: boolean; mine?: boolean; online?: boolean; likes?: number; plays?: boolean; tableAvailable?: boolean } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createProfileMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'profile-menu.js')) as {
    createProfileMenu(host: object): { openProfile(key: string, back: () => void): void; openMine(back: () => void): void };
  };
  let opened: { build: () => Built; at?: number } | undefined;
  const events: string[] = [];
  const state = { ...newSocialState(new Date(0)), enabled: true, key: { publicKey: ME }, name: 'Kiko', friends: opts.friend ? [{ key: THEO, name: 'Théo', since: ago(90_000), events: [] }] : [] };
  const card = (k: string) => ({
    key: k,
    name: k === ME ? 'Kiko' : 'Théo',
    country: 'FR',
    badges: ['first-game'],
    records: 1,
    xp: 20_000,
    friends: 12,
    events: [{ id: `ev-${k[0]}`, kind: 'record', at: ago(30), table: { title: 'Thunder Reef' }, score: 1_000, rank: 1 }],
    likes: { [`ev-${k[0]}`]: opts.likes ?? 3 },
    ...(opts.plays ? { plays: { of: '2026-11-22', day: [], week: [{ board: BOARD('1'), title: 'Thunder Reef', n: 4 }] } } : {}),
    at: ago(5),
    sig: '',
  });
  const net = fakeSocialNet({
    state: () => state,
    publicCard: (k: string) => card(k),
    cardFirstSeen: () => ago(60 * 24 * 365),
    rankings: () => ({ ...emptyRankings(), scores: [score(THEO, BOARD('1'), 1_000), score(ME, BOARD('1'), 400)] }),
    livePlayers: () => (opts.online ? [{ key: THEO, name: 'Théo', status: 'online', at: ago(1), sig: '' }] : []),
    likedByMe: () => false,
    like: (k: string, id: string, on: boolean) => events.push(`like:${id}:${on}`),
    likers: () => opts.likes === 0 ? [] : [{ from: THEO, name: 'Théo', at: ago(3) }],
  });
  const menu = createProfileMenu({
    navKeys: () => ({ previous: ['FlipLeft'], next: ['FlipRight'] }),
    badgeFacts: () => ({ games: 42, tables: 7, seconds: 0, longestTable: 0, records: 0, championTables: 0 }),
    table: { has: () => opts.tableAvailable ?? false, go: (table: { title: string }) => events.push(`table:${table.title}`) },
    library: { openCustom: (build: () => Built, at?: number) => (opened = { build, at }), openSystem: () => undefined },
    net,
    relation: (key: string, name: string) =>
      opts.friend
        ? { rows: [], actions: [{ label: 'Inviter à une partie en direct', key: 'invite', tone: 'quiet', run: () => undefined }], tail: [{ label: 'Retirer de mes amis', key: 'unfriend', icon: 'close', run: () => events.push('unfriend') }], head: { eyebrow: 'Amis depuis mars 2026' } }
        : {
            rows: [],
            actions: [{ label: 'Envoyer une demande d’ami', key: 'request', run: () => events.push(`request:${name}`) }],
            id: { text: `Identifiant : ${key.slice(0, 4)}` },
            // Sa présence publique, telle que friends-menu.ts la donne (jamais sa table entre inconnus).
            ...(opts.online ? { head: { status: { text: 'En ligne', tone: 'signal' }, ring: 'online' } } : {}),
          },
    block: (key: string) => events.push(`block:${key}`),
    openThread: (key: string) => events.push(`thread:${key}`),
    system: { open: (group: string) => events.push(`system:${group}`) },
    now: () => NOW,
  });
  if (opts.mine) menu.openMine(() => events.push('back'));
  else menu.openProfile(THEO, () => events.push('back'));
  const built = () => opened!.build();
  const enterContent = () => {
    if (built().actions.some((a) => a.key?.startsWith('tab:'))) {
      const current = built().hub.tabs.find((t) => t.current)!;
      built().actions.find((a) => a.label === current.label)!.run();
    }
  };
  const press = (label: string) => {
    enterContent();
    const b = built().hub.person.buttons.find((x) => x.label === label);
    assert.ok(b?.action !== undefined, `« ${label} » : un arrêt de l’en-tête`);
    built().actions[b.action]!.run();
  };
  // Un onglet : Exit remonte à la barre d'onglets (règle du 22/11/2026), Start sur l'onglet.
  const tab = (label: string) => {
    if (!built().actions.some((a) => a.key?.startsWith('tab:'))) built().back();
    built().actions.find((a) => a.label === label)!.run();
    return built();
  };
  /** Start sur un élément d'un onglet en liste (un arrêt direct des flippers), par sa clé. */
  const pick = (key: string) => {
    enterContent();
    const a = built().actions.find((x) => x.key?.endsWith(`:${key}`));
    assert.ok(a, `« ${key} » : un arrêt de la liste`);
    a.run();
  };
  return { built, press, tab, pick, events, at: () => opened!.at };
}

test('profil : un écran à onglets, l’en-tête du joueur, quatre onglets et jamais d’onglet Amis', () => {
  const p = profile({ online: true });
  const b = p.built();
  assert.equal(b.hub.person.name, 'Théo');
  assert.equal(b.hub.person.status?.text, 'En ligne', 'sa présence publique, jamais sa table');
  assert.deepEqual(b.hub.tabs.map((x) => x.label), ['Activité', 'Records', 'Badges', 'À propos']);
  assert.ok(b.hub.tabs.find((x) => x.label === 'Activité')!.current, 'ouvert sur Activité');
  assert.ok(!/retour à la roue/.test(b.hint ?? ''), 'Exit revient d’où l’on vient, pas à la roue');
  // À l'arrivée, déjà dans la barre : Exit revient directement d'où l'on vient.
  assert.match(b.hint ?? '', /changer d’onglet.*Exit : retour$/);
  b.back();
  assert.deepEqual(p.events, ['back']);
});

test('profil d’un autre joueur : « Ajouter +25 XP » en tête des actions, curseur dans les onglets ; « Écrire » grisé, sa raison, jamais un arrêt', () => {
  const p = profile();
  const buttons = p.built().hub.person.buttons;
  assert.equal(buttons[0]!.label, 'Ajouter');
  assert.equal(buttons[0]!.primary, true);
  assert.equal(buttons[0]!.xp, '+25 XP');
  assert.equal(p.built().actions[p.at()!]!.key, 'tab:activity', 'le curseur dans la barre d’onglets');
  const write = buttons.find((x) => x.label === 'Écrire')!;
  assert.equal(write.off, 'Entre amis seulement');
  assert.equal(write.action, undefined);
  p.press('Ajouter');
  assert.ok(p.events.includes('request:Théo'));
  // Ce qui reste entre amis est dit, sans rien inventer.
  assert.ok(p.built().hub.sections.some((s) => s.title === 'Entre amis'));
});

test('profil d’un ami hors ligne : « Inviter à jouer » grisé « Hors ligne », « Écrire » devient l’action principale', () => {
  const p = profile({ friend: true });
  const buttons = p.built().hub.person.buttons;
  assert.deepEqual(buttons.map((x) => [x.label, x.off ?? '']), [['Inviter à jouer', 'Hors ligne'], ['Écrire', '']]);
  assert.equal(buttons[1]!.primary, true);
  assert.equal(p.built().hub.person.eyebrow, 'Amis depuis mars 2026');
});

test('Activité : chaque publication porte le pouce et son nombre ; Start l’aime', () => {
  const p = profile();
  const feed = p.built().hub.sections.find((s) => s.title === 'Activité')!;
  const post = feed.cards[0]!;
  assert.equal(post.asideIcon, 'thumb-up');
  assert.equal(post.aside, '3');
  // Onglet en liste : la publication est un arrêt direct, Start l'aime.
  p.pick('event:ev-b');
  assert.ok(p.events.includes('like:ev-b:true'));
});

test('Records : l’écart à rattraper en ambre, sur deux lignes', () => {
  const p = profile();
  const records = p.tab('Records');
  const row = records.hub.sections.flatMap((s) => s.cards)[0]!;
  assert.equal(row.asideTone, 'warning');
  assert.match(row.aside ?? '', /^600\nà rattraper$/);
});

test('À propos : l’identifiant, puis les actions rares en lignes de menu (masquer, bloquer), jamais en cartes', () => {
  const p = profile();
  const about = p.tab('À propos');
  assert.ok(about.hub.sections.some((s) => s.cards.some((c) => c.title.startsWith('Identifiant'))));
  const options = about.hub.sections.find((s) => s.choices?.length)!;
  assert.equal(options.cards.length, 0, 'pas d’encart');
  assert.deepEqual(options.choices!.map((c) => c.title), ['Masquer son activité', 'Bloquer Théo']);
});

test('mon profil : Modifier mon profil, Confidentialité, Mon compte ; Start sur une publication dit qui l’a aimée', () => {
  const p = profile({ mine: true });
  const b = p.built();
  assert.equal(b.heading, 'Mon profil');
  assert.deepEqual(b.hub.person.buttons.map((x) => x.label), ['Modifier mon profil', 'Confidentialité', 'Mon compte']);
  p.press('Confidentialité');
  assert.ok(p.events.includes('system:confidentialite'));
  p.pick('event:ev-a');
  assert.equal(p.built().heading, 'Ont aimé');
});

for (const mine of [false, true]) test(`profil ${mine ? 'personnel' : 'd’un joueur'} : onglets immédiats aux flippers, Start entre, Exit remonte puis revient`, () => {
  const p = profile({ mine });
  const current = () => p.built().hub.tabs.find((t) => t.current)!.label;
  const focused = () => p.built().actions[p.at()!]!.key;
  assert.equal(current(), 'Activité');
  assert.equal(focused(), 'tab:activity');
  for (const [label, key] of [['Records', 'records'], ['Badges', 'badges'], ['À propos', 'about'], ['Activité', 'activity']]) {
    assert.ok(p.built().keys?.({ code: 'FlipRight' }));
    assert.equal(current(), label, 'contenu changé sans Start');
    assert.equal(focused(), `tab:${key}`, 'le curseur reste dans la barre');
  }
  assert.ok(p.built().keys?.({ code: 'FlipLeft' }));
  assert.equal(current(), 'À propos');
  assert.ok(p.built().hub.sections.some((s) => s.choices?.length), 'la section est déjà affichée');
  p.built().actions[p.at()!]!.run();
  assert.ok(!p.built().actions.some((a) => a.key?.startsWith('tab:')), 'Start entre dans le contenu');
  p.built().back();
  assert.equal(focused(), 'tab:about');
  assert.deepEqual(p.events, []);
  p.built().back();
  assert.deepEqual(p.events, ['back']);
});

test('mon activité sans J’aime reste accessible et ouvre une liste vide, sans s’aimer soi-même', () => {
  const p = profile({ mine: true, likes: 0 });
  p.tab('Activité');
  const post = p.built().hub.sections.find((s) => s.title === 'Mon activité')!.cards[0]!;
  assert.ok(post.action !== undefined);
  assert.equal(post.aside, '0');
  p.pick('event:ev-a');
  assert.equal(p.built().heading, 'Ont aimé');
  assert.deepEqual(p.events, []);
});

for (const tableAvailable of [false, true]) test(`mes tables du moment : parcours aux flippers avec table ${tableAvailable ? 'présente' : 'absente'} de la collection`, () => {
  const p = profile({ mine: true, likes: 0, plays: true, tableAvailable });
  p.tab('Activité');
  const week = p.built().hub.sections.find((s) => s.title === 'Mes tables du moment')!.cards[0]!;
  assert.ok(week.action !== undefined, 'un arrêt même quand la table est seulement à lire');
  assert.equal(Boolean(week.readOnly), !tableAvailable);
  const cards = p.built().hub.sections.flatMap((s) => s.cards);
  assert.ok(cards.every((c) => c.action !== undefined), 'le niveau et les autres informations restent lisibles aussi');
  p.pick(`week:${BOARD('1')}`);
  assert.deepEqual(p.events, tableAvailable ? ['table:Thunder Reef'] : []);
  assert.ok(p.built().actions.some((a) => a.key?.endsWith('event:ev-a')), 'l’activité reste dans le parcours');
});

test('onglet Badges : le catalogue remplace les seules médailles, avec ma progression uniquement sur mon profil', () => {
  const mine = profile({ mine: true }).tab('Badges').hub.sections.flatMap((s) => s.cards);
  const other = profile().tab('Badges').hub.sections.flatMap((s) => s.cards);
  assert.ok(mine.length > 40);
  assert.equal(other.length, mine.length);
  assert.match(mine.find((c) => c.title === 'Cent parties')!.detail!, /42 \/ 100 · reste 58/);
  assert.match(other.find((c) => c.title === 'Cent parties')!.detail!, /Progression non partagée/);
  assert.ok(mine.every((c) => c.action !== undefined), 'tous les objectifs sont parcourables aux flippers');
});
