// Affiche du médaillon Communauté sur le plateau (planche « Engagement » validée le 21/11/2026). Ces
// tests fixent :
// - en tête, le message qui m'attend : qui m'a écrit, quand, sa bulle ;
// - mes amis en ligne avec l'anneau de leur présence et ce qu'ils font (la table entre amis) ;
// - personne en ligne : des joueurs suggérés à la place, jamais une affiche vide ;
// - le salon de mon pays et ses dernières lignes, l'activité de mes groupes, les demandes d'ami ;
// - le niveau et les places ont quitté cette affiche pour celle de l'Arène : il n'en reste rien
//   (ni dans la vue, ni dans le dessin, ni dans les styles) ;
// - partage coupé : ce qu'il faut faire, rien d'autre.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { createPlayerKey, newSocialState, setLanguage } from '../index';
import { fakeCommunityMessages, fakeMenuLibrary, fakeSocialNet } from './doublures';

interface Poster {
  empty: boolean;
  heading: string;
  eyebrow: string;
  said?: { name: string; when: string; text: string; who?: string; group?: boolean };
  people: { name: string; ring: string; status: string; level?: { text: string } }[];
  room?: { name: string; present?: string; lines: { nick: string; text: string }[]; problem?: string };
  chips: { icon: string; text: string; hot?: boolean }[];
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createCommunityMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'community-menu.js')) as {
  createCommunityMenu(host: object): { poster(): Poster };
};

const NOW = new Date('2026-11-21T20:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

function poster(opts: { enabled?: boolean; friendOnline?: boolean; waiting?: boolean } = {}): Poster {
  const enabled = opts.enabled ?? true;
  const key = createPlayerKey();
  const state = {
    ...newSocialState(new Date(0)),
    enabled,
    key,
    name: 'Moi',
    friends: [{ key: 'alto', name: 'Alto', since: ago(9000), events: [] }],
    incoming: [{ key: 'cerise', name: 'Cerise', at: ago(30) }],
  };
  const menu = createCommunityMenu({
    library: fakeMenuLibrary(),
    net: fakeSocialNet({
      state: () => state,
      country: () => 'FR',
      status: () => ({ running: true }),
      online: (k: string) => Boolean(opts.friendOnline ?? true) && k === 'alto',
      presenceOf: (k: string) => (k === 'alto' ? { status: 'playing', since: ago(5), table: { title: 'Medieval Madness' } } : undefined),
      // Zoé, joueuse de France classée, pas encore mon amie : une suggestion.
      rankings: () => ({ scores: [{ key: 'zoe', name: 'Zoé', country: 'FR', at: ago(60), score: 1, board: 'x', table: { title: 'T2' } }] }),
      publicCard: (k: string) => (k === 'alto' ? { key: 'alto', name: 'Alto', badges: [], records: 0, xp: 20_000 } : k === 'zoe' ? { key: 'zoe', name: 'Zoé', country: 'FR', badges: [], records: 0 } : undefined),
      cardFirstSeen: () => ago(60 * 24 * 90),
    }),
    zoneKeys: () => [],
    tables: () => [],
    openProfile: () => {},
    myLevel: () => 12,
    messages: {
      ...fakeCommunityMessages({}),
      waiting: () =>
        opts.waiting === false
          ? []
          : [{ kind: 'friend', id: 'nina', key: 'nina', name: 'Nina', unread: 1, last: { text: 'On fait une partie ce soir ?', at: Date.parse(ago(4)) }, open: () => {} }],
    },
    groups: {
      door: () => ({ detail: '', attention: true, quiet: false }),
      open: () => {},
      mine: () => [{ kind: 'group', id: 'g', name: 'Les Flippés du jeudi', unread: 3, detail: 'Table de la semaine : Iron Maiden', open: () => {} }],
    },
    rooms: {
      door: () => ({ label: 'Salon France', detail: '', attention: false, quiet: false }),
      glance: () => ({ name: 'Salon France' }),
      problem: () => undefined,
      peek: () => ({
        id: 'fr',
        name: 'Salon France',
        present: 9,
        lines: ['Salut', 'Qui joue ?', 'Moi sur TZ', 'Bien joué', 'Bonne nuit'].map((text, i) => ({ time: `21:0${i}`, nick: `J${i}`, hue: 10, text })),
        phrases: [],
        others: [],
      }),
      open: () => {},
    },
    rankings: { detail: () => '', open: () => {} },
    openSharing: () => {},
    now: () => NOW,
  });
  return menu.poster();
}

test('Affiche Communauté : le message qui attend, mes amis en ligne, le salon, groupes et demandes', () => {
  setLanguage('fr');
  const p = poster();
  assert.equal(p.empty, false);
  assert.deepEqual([p.said?.name, p.said?.text], ['Nina', 'On fait une partie ce soir ?']);
  assert.match(p.said!.when, /^Il y a 4 min/);
  // L'ami en partie : l'anneau « en partie », sa table (entre amis), son niveau.
  const alto = p.people.find((x) => x.name === 'Alto')!;
  assert.equal(alto.ring, 'playing');
  assert.equal(alto.status, 'Sur Medieval Madness');
  assert.match(alto.level?.text ?? '', /^Niv\. \d+$/);
  // Le salon : ses quatre dernières lignes.
  assert.equal(p.room?.name, 'Salon France');
  assert.equal(p.room?.present, '9 présents');
  assert.deepEqual(p.room?.lines.map((l) => l.text), ['Qui joue ?', 'Moi sur TZ', 'Bien joué', 'Bonne nuit']);
  // Les puces : le groupe qui parle, puis la demande d'ami.
  assert.deepEqual(p.chips.map((c) => [c.icon, c.text, c.hot]), [
    ['group', 'Les Flippés du jeudi · 3 messages', true],
    ['friend-add', '1 demande d’ami', true],
  ]);
  // Au fronton, une phrase : le message qui attend.
  assert.equal(p.heading, 'On fait une partie ce soir ?');
  assert.match(p.eyebrow, /^Nina vous a écrit · il y a 4 min/);
});

test('Affiche Communauté : personne en ligne, des joueurs suggérés à la place (jamais vide)', () => {
  setLanguage('fr');
  const p = poster({ friendOnline: false, waiting: false });
  assert.ok(p.people.length > 0, 'des joueurs suggérés');
  assert.ok(p.people.every((x) => x.ring === 'suggested'));
  assert.deepEqual(p.people.map((x) => [x.name, x.status]), [['Zoé', 'Même pays']]);
  assert.equal(p.said, undefined);
  // Sans message, le fronton dit la dernière ligne du salon.
  assert.equal(p.heading, '<J4> Bonne nuit');
});

test('Affiche Communauté : niveau et places sont partis sur l’affiche de l’Arène', () => {
  setLanguage('fr');
  const p = poster() as unknown as Record<string, unknown>;
  assert.ok(!('standing' in p), 'plus de cases niveau, mondial, pays');
  const js = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'community.js'), 'utf8');
  assert.doesNotMatch(js, /standing|cm-tile/);
  for (const sheet of ['jukebox.css', 'community.css']) assert.doesNotMatch(fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', sheet), 'utf8'), /cm-standing|cm-tile/);
  const menu = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'community-menu.ts'), 'utf8');
  assert.doesNotMatch(menu, /standingView|PosterTile|t\('Mondial'\)/);
});

test('Affiche Communauté : partage coupé, ce qu’il faut faire et rien d’autre', () => {
  setLanguage('fr');
  const p = poster({ enabled: false });
  assert.equal(p.empty, true);
  assert.equal(p.heading, 'Activez le partage');
  assert.deepEqual([p.people, p.chips, p.said, p.room], [[], [], undefined, undefined]);
});
