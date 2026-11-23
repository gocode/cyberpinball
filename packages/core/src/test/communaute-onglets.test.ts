// Communauté à onglets (21/11/2026, planche « Engagement » validée) : l'écran du médaillon reprend le
// composant de l'Arène et sa navigation par blocs. Ces tests fixent :
// - six onglets (Accueil, Messages, Joueurs, Groupes, Salons, Profil), pastille sur ce qui attend ;
// - l'accueil : « Ils vous attendent » (bulle et trois réponses toutes prêtes), « En ligne » (amis, puis
//   joueurs suggérés à ajouter d'un appui, +25 XP par nouvel ami), le salon et ses phrases, « Ça bouge » ;
// - peu de monde en ligne : les suggestions remplacent les amis, jamais une section vide ;
// - « Niv. N » sur chaque joueur, et l'anneau de son palier (pastille avec son niveau) ;
// - pas de bouton « Regarder » (regarder un ami en direct n'existe pas encore) ;
// - l'invitation : dans l'onglet Joueurs ;
// - le menu d'abord : l'écran s'ouvre dans la barre d'onglets, les flippers y montrent chaque onglet ;
//   l'accueil récapitule chaque onglet, Start sur un récapitulatif ouvre l'onglet sur la même bande,
//   Exit ramène au récapitulatif (21/11/2026) ;
// - un joueur n'a qu'un écran : Start sur lui ouvre son profil ;
// - les réglages de la communauté restent au Menu système (aucun onglet ni carte ici).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { createPlayerKey, newSocialState, setLanguage, XP } from '../index';
import { fakeSocialNet } from './doublures';
import { REPO_ROOT } from './i18n-scan';

setLanguage('fr');

const NOW = new Date('2026-11-21T20:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

interface Card {
  title: string;
  name?: string;
  ring?: string;
  level?: { text: string };
  avatar?: { level?: number };
  bubble?: { text: string };
  tables?: { title: string }[];
  tablesNote?: string;
  lines?: unknown[];
  action?: number;
  buttons?: { label: string; quick?: boolean; action?: number }[];
}
interface Built {
  heading: string;
  actions: { label: string; key?: string; run: () => void }[];
  back: () => void;
  keys?: (input: { code: string }) => boolean;
  hub: { facts: string[]; tabs: { label: string; current: boolean; attention?: boolean }[]; sections: { title?: string; note?: string; layout: string; cards: Card[]; choices?: Card[] }[] };
}

type Player = { key: string; name: string; country?: string; status: 'online' | 'playing' | 'offline'; friend: boolean; commonTables?: number };

function hub(opts: { online?: Player[]; everyone?: Player[]; incoming?: boolean } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCommunityHub } = require(path.join(REPO_ROOT, 'app', 'dist', 'community-hub.js')) as { createCommunityHub(host: unknown): { openHome(back: () => void): void } };
  let opened: (() => Built) | undefined;
  let at: number | undefined;
  const events: string[] = [];
  const key = createPlayerKey();
  const online = opts.online ?? [{ key: 'alto', name: 'Alto', status: 'playing', friend: true }];
  const everyone = opts.everyone ?? [...online, { key: 'ines', name: 'Inès', country: 'FR', status: 'online', friend: false, commonTables: 3 }];
  const state = {
    ...newSocialState(new Date(0)),
    enabled: true,
    key,
    name: 'Moi',
    friends: online.filter((p) => p.friend).map((p) => ({ key: p.key, name: p.name, since: ago(9000), events: [] })),
    incoming: opts.incoming ? [{ key: 'cerise', name: 'Cerise', at: ago(30) }] : [],
  };
  const sent: string[] = [];
  const menu = createCommunityHub({
    library: {
      openCustom: (build: () => Built, a?: number) => ((opened = build), (at = a)),
      openSystemGroupFrom: (g: string) => events.push(`groupe:${g}`),
    },
    zoneKeys: () => ['MagnaLeft', 'MagnaRight'],
    net: fakeSocialNet({
      state: () => state,
      country: () => 'FR',
      publicCard: (k: string) => ({ key: k, name: k, badges: [], records: 0, xp: k === 'ines' ? 50 : 20_000 }),
      cardFirstSeen: () => ago(60 * 24 * 90),
      presenceOf: (k: string) => (k === 'alto' ? { status: 'playing', since: ago(5), table: { title: 'Medieval Madness' } } : undefined),
      request: (p: { name: string }) => sent.push(`demande:${p.name}`),
      likedByMe: () => false,
    }),
    myLevel: () => 12,
    players: {
      online: () => online,
      everyone: () => everyone,
      // Inès a quatre tables en commun avec moi (la première est une de mes favorites).
      sharedTables: (k: string) => (k === 'ines' ? ['Star Courier', 'Neon Abyss', 'Thunder Reef', 'Atlas Rising'].map((title) => ({ title, src: `cyber-media://${title}` })) : []),
      open: (_b: unknown, tab: string) => events.push(`joueurs:${tab}`),
      detail: () => '',
    },
    profile: { open: (k: string) => events.push(`profil:${k}`), openMine: () => events.push('mon-profil') },
    friends: { find: () => events.push('trouver'), requests: () => events.push('demandes') },
    messages: {
      waiting: () => [{ kind: 'friend', id: 'nina', key: 'nina', name: 'Nina', unread: 1, last: { text: 'On fait une partie ce soir ?', at: Date.parse(ago(4)) }, open: () => events.push('fil:nina'), reply: (text: string) => (sent.push(`nina:${text}`), true) }],
      recent: () => [],
      open: () => events.push('messages'),
      detail: () => '',
    },
    groups: { mine: () => [], open: () => events.push('groupes'), door: () => ({ detail: '', attention: false, quiet: false }) },
    room: {
      peek: () => ({ id: 'fr', name: 'Salon France', present: 9, lines: [{ time: '21:00', nick: 'Bruno', hue: 10, text: 'Qui joue ?' }], phrases: ['Salut tout le monde !', 'Qui joue ?', 'Bonne partie !'], others: [] }),
      problem: () => undefined,
      write: (text: string) => void sent.push(`salon:${text}`),
      open: () => events.push('salon'),
      openRoom: () => events.push('autre-salon'),
    },
    invite: { count: () => 1 },
    navKeys: () => ({ previous: ['FlipperLeft'], next: ['FlipperRight'] }),
    now: () => NOW,
  });
  const built = () => opened!();
  const run = (k: string) => built().actions.find((a) => a.key === k)!.run();
  const inTabs = () => built().actions.some((a) => a.key!.startsWith('tab:'));
  const atBlocks = () => built().actions.some((a) => a.key!.startsWith('block:section:') || a.key === 'block:tabs');
  /** Un onglet en liste (hors Accueil) : ses éléments sont des arrêts directs. */
  const inList = () => built().actions.some((a) => a.key!.startsWith('block:item:'));
  const current = () => TAB_IDS[built().hub.tabs.find((x) => x.current)!.label]!;
  /** Un onglet : remonter jusqu'à la barre d'onglets, puis Start sur lui (son contenu, au choix des blocs). */
  const tab = (id: string) => {
    for (let i = 0; i < 4 && !inTabs(); i++) atBlocks() && built().actions.some((a) => a.key === 'block:tabs') ? run('block:tabs') : built().back();
    run(`tab:${id}`);
  };
  /** Start sur le bloc de la section qui porte ce titre (depuis la barre : on entre d'abord dans le contenu). */
  const enter = (title: string) => {
    if (inTabs()) run(`tab:${current()}`);
    const i = built().hub.sections.findIndex((s) => s.title === title);
    assert.ok(i >= 0, `section « ${title} »`);
    built().actions.find((a) => a.key === `block:section:${i}`)!.run();
  };
  return { menu, events, sent, built, at: () => at, run, tab, enter, inTabs, atBlocks, inList, current };
}

const TAB_IDS: Record<string, string> = { Accueil: 'home', Messages: 'messages', Joueurs: 'players', Groupes: 'groups', Salons: 'rooms', Profil: 'profile' };

test('Communauté à onglets : le curseur dans la barre d’onglets, les flippers y montrent chaque onglet', () => {
  const h = hub({ incoming: true });
  h.menu.openHome(() => h.events.push('roue'));
  const b = h.built();
  assert.equal(b.heading, 'Communauté');
  assert.deepEqual(b.hub.tabs.map((t) => t.label), ['Accueil', 'Messages', 'Joueurs', 'Groupes', 'Salons', 'Profil']);
  assert.equal(b.hub.tabs.find((t) => t.label === 'Messages')!.attention, true, 'un message attend');
  assert.equal(b.hub.tabs.find((t) => t.label === 'Joueurs')!.attention, true, 'une demande d’ami attend');
  // À l'ouverture : dans la barre d'onglets, sur Accueil (le menu d'abord).
  assert.ok(h.inTabs(), b.actions.map((a) => a.key).join(', '));
  assert.equal(h.at(), 0);
  // Un flipper : l'onglet suivant et son contenu tout de suite, le curseur reste dans la barre.
  assert.equal(b.keys!({ code: 'FlipperRight' }), true);
  assert.equal(h.current(), 'messages');
  assert.ok(h.inTabs());
  assert.equal(h.at(), 1);
  assert.equal(h.built().hub.sections[0]!.title, 'Ils t’attendent', 'le contenu de l’onglet est déjà là');
  h.built().keys!({ code: 'FlipperLeft' });
  h.built().keys!({ code: 'FlipperLeft' });
  assert.equal(h.current(), 'profile', 'la barre boucle');
  // Start : dans le contenu, une liste sans blocs (hors Accueil, règle du 22/11/2026), le curseur sur son
  // premier élément (la barre d'onglets la précède, à sa place) ; Exit quitte l'écran (23/11/2026).
  h.run('tab:profile');
  assert.ok(h.inList(), h.built().actions.map((a) => a.key).join(', '));
  assert.equal(h.built().actions[0]!.key, 'block:tabs');
  assert.equal(h.at(), 1);
  assert.deepEqual(h.events, []);
  h.built().back();
  assert.deepEqual(h.events, ['roue']);
});

test('Accueil : un récapitulatif par onglet ; Start ouvre l’onglet sur la même bande, Exit y ramène', () => {
  const h = hub({ incoming: true });
  h.menu.openHome(() => h.events.push('roue'));
  h.run('tab:home');
  const titles = h.built().hub.sections.map((s) => s.title);
  // Dans l'ordre des onglets : Messages, Joueurs, Groupes, Salons, Profil ; « Ça bouge » à part.
  assert.deepEqual(titles.slice(0, 5), ['Ils t’attendent', 'Joueurs à découvrir', 'Mes groupes', 'Salon France', 'Mon profil']);
  assert.ok(!titles.includes('Fais découvrir Cyber Pinball'), 'l’invitation est dans l’onglet Joueurs');
  // Start sur « En ligne » : l'onglet Joueurs, le curseur dans sa première bande, la même.
  h.enter('Joueurs à découvrir');
  assert.equal(h.current(), 'players');
  assert.equal(h.built().hub.sections[1]!.title, 'Joueurs à découvrir');
  assert.ok(h.inList() && !h.inTabs(), 'dans la liste de l’onglet');
  assert.equal(h.at(), 1, 'le curseur sur le premier élément de la bande (après la barre d’onglets)');
  assert.ok(h.built().actions.some((a) => a.label === 'Ajouter en ami'), 'on y ajoute un joueur d’un appui');
  assert.ok(h.built().actions.some((a) => a.label === 'Voir le profil'), 'et on voit d’abord son profil (jamais d’ajout à l’aveugle)');
  // Exit : retour à l'accueil, le curseur sur ce récapitulatif (la barre d'onglets, puis Messages, puis En ligne).
  h.built().back();
  assert.equal(h.current(), 'home');
  assert.ok(h.atBlocks());
  assert.equal(h.at(), 2);
  // Un récapitulatif sans action (aucun groupe) s'ouvre aussi.
  h.enter('Mes groupes');
  assert.equal(h.current(), 'groups');
});

test('Accueil : le message qui attend, trois réponses toutes prêtes ; une réponse part d’un appui', () => {
  const h = hub();
  h.menu.openHome(() => undefined);
  h.run('tab:home');
  const nina = h.built().hub.sections[0]!.cards[0]!;
  assert.equal(nina.bubble?.text, 'On fait une partie ce soir ?');
  assert.deepEqual(nina.buttons!.filter((x) => x.quick).map((x) => x.label), ['Partant !', 'Quelle table ?', 'Plus tard']);
  h.enter('Ils t’attendent');
  assert.equal(h.current(), 'messages');
  h.built().actions.find((a) => a.label === 'Partant !')!.run();
  assert.deepEqual(h.sent, ['nina:Partant !']);
  assert.equal(h.built().hub.sections[0]!.note, 'Envoyé à Nina', 'le constat en note du titre');
});

test('« En ligne » = amis puis joueurs suggérés ; « Ajouter en ami » d’un appui, +25 XP par nouvel ami ; niveau sur chacun ; « Tous les joueurs »', () => {
  const h = hub();
  h.menu.openHome(() => undefined);
  h.run('tab:home');
  const sec = h.built().hub.sections.find((s) => s.title === 'Joueurs à découvrir')!;
  assert.equal(sec.layout, 'people');
  assert.equal(sec.note, `+${XP.friend} XP par nouvel ami`);
  // Les joueurs, puis « Tous les joueurs » : la liste complète d'un appui.
  assert.deepEqual(sec.cards.map((c) => [c.title, c.ring]), [['Alto', 'playing'], ['Inès', 'suggested'], ['Tous les joueurs', undefined]]);
  for (const c of sec.cards.filter((x) => x.ring)) {
    assert.match(c.level?.text ?? '', /^Niv\. \d+$/, `« Niv. N » sur ${c.title}`);
    assert.ok(c.avatar?.level, `l’anneau du palier sur ${c.title}`);
  }
  // Les tables en commun en médaillons, trois au plus, puis « +1 table en commun » (22/11/2026).
  const ines = sec.cards.find((c) => c.title === 'Inès')!;
  assert.deepEqual([ines.tables?.map((x) => x.title), ines.tablesNote], [['Star Courier', 'Neon Abyss', 'Thunder Reef'], '+1 table en commun']);
  // Pas de « Regarder » : regarder un ami en direct n'existe pas encore.
  const labels = h.built().hub.sections.flatMap((s) => s.cards.flatMap((c) => (c.buttons ?? []).map((x) => x.label)));
  assert.ok(!labels.some((l) => /Regarder/i.test(l)), labels.join(', '));
  // Dans la bande : un ami ouvre son profil (un seul écran par joueur), « Ajouter », « Tous les joueurs ».
  h.enter('Joueurs à découvrir');
  h.built().actions.find((a) => a.label === 'Alto')!.run();
  h.built().actions.find((a) => a.label === 'Ajouter en ami')!.run();
  h.built().actions.find((a) => a.label === 'Tous les joueurs')!.run();
  assert.deepEqual(h.sent, ['demande:Inès']);
  assert.deepEqual(h.events, ['profil:alto', 'joueurs:all']);
});

test('Peu de monde en ligne : les suggestions remplacent les amis, jamais une section vide', () => {
  const nobody = hub({ online: [], everyone: [{ key: 'ines', name: 'Inès', country: 'FR', status: 'offline', friend: false, commonTables: 2 }, { key: 'theo', name: 'Théo', status: 'offline', friend: false, commonTables: 1 }] });
  nobody.menu.openHome(() => undefined);
  nobody.run('tab:home');
  const sec = nobody.built().hub.sections.find((s) => s.title === 'Joueurs à découvrir')!;
  const people = sec.cards.filter((c) => c.title !== 'Tous les joueurs');
  assert.ok(people.length >= 2);
  assert.ok(people.every((c) => c.ring === 'suggested'));
  for (const s of nobody.built().hub.sections) assert.ok(s.cards.length, `« ${s.title} » n’est jamais vide`);
});

test('Joueurs : la bande « En ligne » d’abord, puis les demandes reçues, l’invitation et les écrans complets', () => {
  const h = hub({ incoming: true });
  h.menu.openHome(() => undefined);
  h.tab('players');
  const titles = h.built().hub.sections.map((s) => s.title);
  // « Connectés en ce moment » : ceux que la bande ne montre pas, et la liste complète d'un appui.
  assert.deepEqual(titles, ['Connectés en ce moment', 'Joueurs à découvrir', 'Demandes d’ami', 'Fais découvrir Cyber Pinball', 'Tout voir']);
  assert.deepEqual(h.built().hub.sections[0]!.cards.map((c) => c.title), ['Alto'], 'les connectés restent visibles même si déjà suggérés');
  h.built().actions.find((a) => a.label === 'Tous les connectés')!.run();
  assert.deepEqual(h.events.splice(0), ['joueurs:all']);
  // Les entrées du bas : des lignes d'actions, chacune un arrêt au premier niveau.
  h.built().actions.find((a) => a.key!.startsWith('block:choice:') && a.label === 'Mes amis')!.run();
  assert.deepEqual(h.events, ['joueurs:friends']);
});

test('Profil : mon profil et ce qui me concerne ; les réglages de la communauté restent au Menu système', () => {
  const h = hub();
  h.menu.openHome(() => undefined);
  h.tab('profile');
  const all = h.built().hub.sections.flatMap((s) => [...s.cards, ...(s.choices ?? [])].map((c) => c.title));
  assert.ok(all.includes('Modifier mon profil') && all.includes('Mon compte'));
  for (const off of ['Réglages de la communauté', 'Partage et réseau', 'Présence et salons', 'Jouer en local']) assert.ok(!all.includes(off), off);
  // Une liste de choix : pas d'encart (aucune carte), chaque entrée est un arrêt du premier niveau que Start valide,
  // dessinée comme les lignes d'actions des autres menus (retour du mainteneur, 21/11/2026).
  const sec = h.built().hub.sections.find((s) => s.title === 'Pseudo, confidentialité, compte')!;
  assert.deepEqual([sec.cards.length, sec.choices?.map((c) => c.title)], [0, ['Modifier mon profil', 'Confidentialité', 'Mon compte']]);
  h.built().actions.find((a) => a.key!.startsWith('block:choice:') && a.label === 'Mon compte')!.run();
  assert.deepEqual(h.events, ['groupe:compte'], 'Start sur l’entrée l’ouvre, sans bloc où entrer');
  const js = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'hub.js'), 'utf8');
  assert.match(js, /el\('ol', 'lib-actions with-icons hub-choices'\)/);
  assert.match(js, /el\('li', `lib-action tone-/);
});
