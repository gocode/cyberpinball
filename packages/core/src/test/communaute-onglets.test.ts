// Communauté à onglets (21/11/2026, planche « Engagement » validée) : l'écran du médaillon reprend le
// composant de l'Arène et sa navigation par blocs. Ces tests fixent :
// - six onglets (Accueil, Messages, Joueurs, Groupes, Salons, Profil), pastille sur ce qui attend ;
// - l'accueil : « Ils vous attendent » (bulle et trois réponses toutes prêtes), « En ligne » (amis, puis
//   joueurs suggérés à ajouter d'un appui, +25 XP par nouvel ami), le salon et ses phrases, « Ça bouge » ;
// - peu de monde en ligne : les suggestions remplacent les amis, jamais une section vide ;
// - « Niv. N » sur chaque joueur, et l'anneau de son palier (pastille avec son niveau) ;
// - pas de bouton « Regarder » (regarder un ami en direct n'existe pas encore) ;
// - l'invitation : sur l'accueil au bureau, dans l'onglet Joueurs en borne ;
// - un joueur n'a qu'un écran : Start sur lui ouvre son profil ;
// - les réglages de la communauté restent au Menu système (aucun onglet ni carte ici).

import assert from 'node:assert/strict';
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
  lines?: unknown[];
  action?: number;
  buttons?: { label: string; quick?: boolean; action?: number }[];
}
interface Built {
  heading: string;
  actions: { label: string; key?: string; run: () => void }[];
  back: () => void;
  keys?: (input: { code: string }) => boolean;
  hub: { facts: string[]; tabs: { label: string; current: boolean; attention?: boolean }[]; sections: { title?: string; note?: string; layout: string; cards: Card[] }[] };
}

type Player = { key: string; name: string; country?: string; status: 'online' | 'playing' | 'offline'; friend: boolean; commonTables?: number };

function hub(opts: { online?: Player[]; everyone?: Player[]; desk?: boolean; incoming?: boolean } = {}) {
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
    players: { online: () => online, everyone: () => everyone, open: (_b: unknown, tab: string) => events.push(`joueurs:${tab}`), detail: () => '' },
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
    desk: () => Boolean(opts.desk),
    now: () => NOW,
  });
  const built = () => opened!();
  const run = (k: string) => built().actions.find((a) => a.key === k)!.run();
  const tab = (id: string) => {
    if (!built().actions.some((a) => a.key!.startsWith('block:'))) built().back();
    run('block:tabs');
    run(`tab:${id}`);
  };
  /** Entrer dans le bloc de la section qui porte ce titre. */
  const enter = (title: string) => {
    if (!built().actions.some((a) => a.key!.startsWith('block:'))) built().back();
    const i = built().hub.sections.findIndex((s) => s.title === title);
    assert.ok(i >= 0, `section « ${title} »`);
    built().actions.find((a) => a.key === `block:section:${i}`)!.run();
  };
  return { menu, events, sent, built, at: () => at, run, tab, enter };
}

test('Communauté à onglets : six onglets, la barre puis les blocs, MagnaSave et Exit', () => {
  const h = hub({ incoming: true });
  h.menu.openHome(() => h.events.push('roue'));
  const b = h.built();
  assert.equal(b.heading, 'Communauté');
  assert.deepEqual(b.hub.tabs.map((t) => t.label), ['Accueil', 'Messages', 'Joueurs', 'Groupes', 'Salons', 'Profil']);
  assert.equal(b.hub.tabs.find((t) => t.label === 'Messages')!.attention, true, 'un message attend');
  assert.equal(b.hub.tabs.find((t) => t.label === 'Joueurs')!.attention, true, 'une demande d’ami attend');
  // Navigation par blocs, comme l'Arène : la barre d'onglets d'abord, le curseur sur le premier bloc du contenu.
  assert.ok(b.actions.every((a) => a.key!.startsWith('block:')));
  assert.equal(b.actions[0]!.key, 'block:tabs');
  assert.equal(h.at(), 1);
  b.keys!({ code: 'MagnaRight' });
  assert.equal(h.built().hub.tabs.find((t) => t.current)!.label, 'Messages');
  h.built().back();
  assert.deepEqual(h.events, ['roue']);
});

test('Accueil : le message qui attend, trois réponses toutes prêtes ; une réponse part d’un appui', () => {
  const h = hub();
  h.menu.openHome(() => undefined);
  const titles = h.built().hub.sections.map((s) => s.title);
  assert.deepEqual(titles, ['Ils vous attendent', 'En ligne', 'Salon France', 'Ça bouge'].filter((x) => titles.includes(x)));
  assert.equal(titles[0], 'Ils vous attendent');
  const nina = h.built().hub.sections[0]!.cards[0]!;
  assert.equal(nina.bubble?.text, 'On fait une partie ce soir ?');
  assert.deepEqual(nina.buttons!.filter((x) => x.quick).map((x) => x.label), ['Partant !', 'Quelle table ?', 'Plus tard']);
  h.enter('Ils vous attendent');
  h.built().actions.find((a) => a.label === 'Partant !')!.run();
  assert.deepEqual(h.sent, ['nina:Partant !']);
  assert.equal(h.built().hub.sections[0]!.note, 'Envoyé à Nina', 'le constat en note du titre');
});

test('Accueil : « En ligne » = amis puis joueurs suggérés ; « Ajouter » d’un appui, +25 XP par nouvel ami ; niveau sur chacun', () => {
  const h = hub();
  h.menu.openHome(() => undefined);
  const sec = h.built().hub.sections.find((s) => s.title === 'En ligne')!;
  assert.equal(sec.layout, 'people');
  assert.equal(sec.note, `+${XP.friend} XP par nouvel ami`);
  assert.deepEqual(sec.cards.map((c) => [c.title, c.ring]), [['Alto', 'playing'], ['Inès', 'suggested']]);
  for (const c of sec.cards) {
    assert.match(c.level?.text ?? '', /^Niv\. \d+$/, `« Niv. N » sur ${c.title}`);
    assert.ok(c.avatar?.level, `l’anneau du palier sur ${c.title}`);
  }
  // Pas de « Regarder » : regarder un ami en direct n'existe pas encore.
  const labels = h.built().hub.sections.flatMap((s) => s.cards.flatMap((c) => (c.buttons ?? []).map((x) => x.label)));
  assert.ok(!labels.some((l) => /Regarder/i.test(l)), labels.join(', '));
  // Un ami : Start ouvre son profil (un seul écran par joueur).
  h.enter('En ligne');
  h.built().actions.find((a) => a.label === 'Alto')!.run();
  assert.deepEqual(h.events, ['profil:alto']);
  h.enter('En ligne');
  h.built().actions.find((a) => a.label === 'Ajouter')!.run();
  assert.deepEqual(h.sent, ['demande:Inès']);
});

test('Peu de monde en ligne : les suggestions remplacent les amis, jamais une section vide', () => {
  const nobody = hub({ online: [], everyone: [{ key: 'ines', name: 'Inès', country: 'FR', status: 'offline', friend: false, commonTables: 2 }, { key: 'theo', name: 'Théo', status: 'offline', friend: false, commonTables: 1 }] });
  nobody.menu.openHome(() => undefined);
  const sec = nobody.built().hub.sections.find((s) => s.title === 'En ligne')!;
  assert.ok(sec.cards.length >= 2);
  assert.ok(sec.cards.every((c) => c.ring === 'suggested'));
  for (const s of nobody.built().hub.sections) assert.ok(s.cards.length, `« ${s.title} » n’est jamais vide`);
});

test('Invitation : sur l’accueil au bureau, dans l’onglet Joueurs en borne', () => {
  const desk = hub({ desk: true });
  desk.menu.openHome(() => undefined);
  assert.ok(desk.built().hub.sections.some((s) => s.title === 'Faites découvrir Cyber Pinball'));
  desk.tab('players');
  assert.ok(!desk.built().hub.sections.some((s) => s.title === 'Faites découvrir Cyber Pinball'));
  const cab = hub({ desk: false });
  cab.menu.openHome(() => undefined);
  assert.ok(!cab.built().hub.sections.some((s) => s.title === 'Faites découvrir Cyber Pinball'));
  cab.tab('players');
  assert.ok(cab.built().hub.sections.some((s) => s.title === 'Faites découvrir Cyber Pinball'));
});

test('Joueurs : les demandes reçues en tête, accepter d’un appui ; les écrans complets', () => {
  const h = hub({ incoming: true });
  h.menu.openHome(() => undefined);
  h.tab('players');
  const titles = h.built().hub.sections.map((s) => s.title);
  assert.equal(titles[0], 'Demandes d’ami');
  h.enter('Tout voir');
  h.built().actions.find((a) => a.label === 'Mes amis')!.run();
  assert.deepEqual(h.events, ['joueurs:friends']);
});

test('Profil : mon profil et ce qui me concerne ; les réglages de la communauté restent au Menu système', () => {
  const h = hub();
  h.menu.openHome(() => undefined);
  h.tab('profile');
  const all = h.built().hub.sections.flatMap((s) => s.cards.map((c) => c.title));
  assert.ok(all.includes('Modifier mon profil') && all.includes('Mon compte'));
  for (const off of ['Réglages de la communauté', 'Partage et réseau', 'Présence et salons', 'Jouer en local']) assert.ok(!all.includes(off), off);
});
