// Accueil Communauté (app/src/community-menu.ts) : « Retours et propositions » tout en bas (16/11/2026), la même
// entrée que Menu système > Cyber Pinball. Ces tests fixent :
// - la porte est la dernière avant « Retour », avec ce que dit l'entrée du menu système ;
// - Start l'ouvre avec un « Retour » qui ramène à l'accueil Communauté ;
// - sans service des retours, pas de porte (jamais une entrée morte).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT, interfaceSources } from './i18n-scan';
import { SYSTEM_ITEMS, createPlayerKey, newSocialState, setLanguage } from '../index';

interface Built {
  heading: string;
  actions: { label: string; detail?: string; icon?: string; run: () => void }[];
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createCommunityMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'community-menu.js')) as {
  createCommunityMenu(host: object): { openHome(back: () => void): void };
};

function harness(withFeedback: boolean) {
  let screen: (() => Built) | undefined;
  const feedbackOpened: (() => void)[] = [];
  const menu = createCommunityMenu({
    library: { openCustom: (build: () => Built) => (screen = build), openSystem: () => (screen = undefined) },
    net: { state: () => ({ enabled: false }), country: () => undefined, rankings: () => ({ scores: [] }) },
    zoneKeys: () => [],
    tables: () => [],
    openProfile: () => {},
    openFriend: () => {},
    messages: { detail: () => '', attention: () => false, quiet: () => true, open: () => {} },
    rankings: { detail: () => '', open: () => {} },
    openSharing: () => {},
    ...(withFeedback ? { feedback: { detail: () => '3 propositions · 1 de vous', open: (back: () => void) => feedbackOpened.push(back) } } : {}),
  });
  menu.openHome(() => (screen = undefined));
  return { built: () => screen!(), feedbackOpened };
}

test('Communauté : « Retours et propositions » tout en bas, juste avant « Retour »', () => {
  setLanguage('fr');
  const h = harness(true);
  const b = h.built();
  assert.equal(b.heading, 'Communauté');
  const labels = b.actions.map((a) => a.label);
  assert.deepEqual(labels.slice(-2), ['Retours et propositions', 'Retour']);
  const door = b.actions.at(-2)!;
  assert.equal(door.detail, '3 propositions · 1 de vous');
  assert.equal(door.icon, 'inbox');
});

test('Communauté : « Retours et propositions » revient à l’accueil Communauté', () => {
  setLanguage('fr');
  const h = harness(true);
  h.built().actions.find((a) => a.label === 'Retours et propositions')!.run();
  assert.equal(h.feedbackOpened.length, 1);
  h.feedbackOpened[0]!();
  assert.equal(h.built().heading, 'Communauté');
});

test('Communauté : sans service des retours, pas de porte', () => {
  setLanguage('fr');
  const labels = harness(false).built().actions.map((a) => a.label);
  assert.ok(!labels.includes('Retours et propositions'));
  assert.equal(labels.at(-1), 'Retour');
});

// Joueurs en ligne (16/11/2026) : leur nombre, et celui de mon pays, ne se disent qu'au-delà de cinq
// (shownCrowd) : sur l'affiche du médaillon, l'entrée du menu système et les onglets de l'écran ; mes
// amis en ligne se comptent toujours.
test('Communauté : le nombre de joueurs en ligne ne se dit qu’au-delà de cinq', () => {
  setLanguage('fr');
  const base = newSocialState(new Date(0));
  const at = new Date().toISOString();
  const friend = { key: 'f'.repeat(64), name: 'Bruno', since: at, events: [] };
  const views = (n: number) => {
    const beacons = Array.from({ length: n }, (_, i) => ({ key: String(i).padStart(64, 'a'), name: `Joueur${i}`, country: 'FR', status: 'online', at }));
    let screen: (() => Built & { tabs?: { label: string; count: string }[]; subheading?: string }) | undefined;
    const menu = createCommunityMenu({
      library: { openCustom: (build: () => Built) => (screen = build), openSystem: () => undefined },
      net: {
        state: () => ({ ...base, enabled: true, key: createPlayerKey(), friends: [friend] }),
        country: () => 'FR',
        rankings: () => ({ scores: [] }),
        livePlayers: () => beacons,
        online: (k: string) => k === friend.key,
        presenceOf: () => undefined,
        publicCard: () => undefined,
        avatarFile: () => undefined,
        status: () => ({ running: true }),
      },
      zoneKeys: () => [],
      tables: () => [],
      openProfile: () => {},
      openFriend: () => {},
      messages: { detail: () => '', attention: () => false, quiet: () => true, open: () => {} },
      rankings: { detail: () => '', open: () => {} },
      openSharing: () => {},
    }) as unknown as { poster(): { stats: string }; item: { detail: string }; openPlayers(back?: () => void): void };
    menu.openPlayers(() => undefined);
    const shown = screen!();
    return { stats: menu.poster().stats, item: menu.item.detail, tabs: (shown.tabs ?? []).map((t) => t.count), sub: shown.subheading };
  };
  // Trois inconnus et Bruno : quatre en ligne, rien de chiffré sauf l'ami.
  const few = views(3);
  assert.equal(few.stats, '1 ami');
  assert.equal(few.item, '1 ami');
  assert.ok(few.tabs.every((c) => c === ''), few.tabs.join('|'));
  // Huit inconnus et Bruno : neuf en ligne, dont neuf en France.
  const many = views(8);
  assert.match(many.stats, /^9 joueurs en ligne · 8 en France · 1 ami$/);
  assert.equal(many.tabs[0], '9');
});

// Le nom de la porte (17/11/2026) : « Avis » ne disait pas qu'on y signale aussi un problème ; « Retours et
// propositions » couvre les deux. L'ancien nom ne revient nulle part : écrans, téléphone, cœur, manuels.
test('Retours et propositions : l’ancien nom « Avis et propositions » ne reparaît nulle part', () => {
  const manuals = ['docs/manuel', 'docs/manual'].flatMap((dir) =>
    fs.readdirSync(path.join(REPO_ROOT, dir)).filter((name) => name.endsWith('.md')).map((name) => `${dir}/${name}`),
  );
  const files = [...interfaceSources(), ...manuals, 'docs/manuel.md', 'docs/manual.md'];
  const stale = files.filter((file) => /avis et propositions/i.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')));
  assert.deepEqual(stale, []);
  setLanguage('fr');
  assert.equal(SYSTEM_ITEMS.feedback.label, 'Retours et propositions');
  setLanguage('en');
  assert.equal(SYSTEM_ITEMS.feedback.label, 'Feedback and ideas');
  setLanguage('fr');
});
