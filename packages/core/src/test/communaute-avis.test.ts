// Accueil Communauté (app/src/community-menu.ts). Depuis le 20/11/2026, l'accueil du médaillon EST la rubrique
// Communauté du Menu système (un seul écran) ; « Retours et propositions » n'y est plus, il est dans Aide et
// infos. Ces tests fixent :
// - le médaillon ouvre la rubrique elle-même, son « Retour » vers la roue, avec le compte des joueurs en tête ;
// - les entrées propres à l'accueil (classements, salon du pays, niveau, parties instantanées, groupes) sont fournies ;
// - le nombre de joueurs en ligne ne se dit qu'au-delà de cinq.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT, interfaceSources } from './i18n-scan';
import { SYSTEM_ITEMS, createPlayerKey, newSocialState, setLanguage } from '../index';
import { fakeCommunityMessages, fakeMenuLibrary, fakeSocialNet } from './doublures';

interface Built {
  heading: string;
  actions: { label: string; detail?: string; icon?: string; run: () => void }[];
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createCommunityMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'community-menu.js')) as {
  createCommunityMenu(host: object): {
    openHome(back: () => void): void;
    homeItems: Partial<Record<'my-level' | 'instant' | 'groups' | 'rooms' | 'rankings', { label?: string; detail?: string; tone?: string; attention?: boolean; run(): void }>>;
  };
};

/** Ce que le module demande à l'écran des tables, noté : la rubrique ouverte, et ce qu'elle porte en tête. */
function harness(extra: object = {}) {
  const did: string[] = [];
  let decor: (() => { subheading?: string; lead?: string }) | undefined;
  const menu = createCommunityMenu({
    library: fakeMenuLibrary({
      openCustom: () => void did.push('écran'),
      openSystem: () => void did.push('menu système'),
      openSystemGroupFrom: (group: string, back: () => void) => {
        did.push(`rubrique ${group}`);
        back();
      },
      decorateSystemGroup: (group: string, d: () => { subheading?: string; lead?: string }) => {
        did.push(`décor ${group}`);
        decor = d;
      },
    }),
    net: { state: () => ({ enabled: false }), country: () => undefined, rankings: () => ({ scores: [] }) },
    zoneKeys: () => [],
    tables: () => [],
    openProfile: () => {},
    openFriend: () => {},
    messages: fakeCommunityMessages({}),
    rankings: { detail: () => '3 tables classées', open: (back: () => void) => (did.push('classements'), back()) },
    openSharing: () => {},
    ...extra,
  });
  return { menu, did, decor: () => decor!() };
}

test('Communauté : le médaillon ouvre la rubrique du Menu système elle-même, pas un écran à part', () => {
  setLanguage('fr');
  const h = harness();
  assert.deepEqual(h.did, ['décor amis'], 'l’accueil se décore à la création');
  let back = 0;
  h.menu.openHome(() => back++);
  assert.deepEqual(h.did, ['décor amis', 'rubrique amis']);
  assert.equal(back, 1, 'son « Retour » est celui du médaillon');
  assert.equal(h.decor().subheading, 'Partage désactivé');
  assert.match(h.decor().lead!, /^Ce que voient les autres joueurs/);
});

test('Communauté : l’accueil a ses entrées à lui, qui reviennent à l’accueil', () => {
  setLanguage('fr');
  const h = harness();
  assert.deepEqual(Object.keys(h.menu.homeItems).sort(), ['rankings', 'rooms'], 'sans niveau, parties instantanées ni groupes : leurs entrées n’existent pas');
  assert.equal(h.menu.homeItems.rankings!.detail, '3 tables classées');
  h.menu.homeItems.rankings!.run();
  assert.deepEqual(h.did.slice(-2), ['classements', 'menu système'], 'le « Retour » des classements ramène à la rubrique');
  // Pas encore de salons : l'entrée le dit, grisée, et ne mène nulle part ailleurs.
  assert.equal(h.menu.homeItems.rooms!.tone, 'quiet');
  const full = harness({
    level: { detail: () => 'Niveau 4', avatar: () => ({}), open: () => {} },
    instant: { door: () => ({ label: 'Partie instantanée', detail: 'Aucune ouverte', quiet: true }), open: () => {} },
    groups: { door: () => ({ detail: '2 groupes', attention: true, quiet: false }), open: () => {} },
  });
  assert.deepEqual(Object.keys(full.menu.homeItems).sort(), ['groups', 'instant', 'my-level', 'rankings', 'rooms']);
  assert.equal(full.menu.homeItems.groups!.attention, true);
  assert.equal(full.menu.homeItems.instant!.tone, 'quiet');
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
      library: fakeMenuLibrary({ openCustom: (build: () => unknown) => void (screen = build as () => Built) }),
      net: fakeSocialNet({
        state: () => ({ ...base, enabled: true, key: createPlayerKey(), friends: [friend] }),
        country: () => 'FR',
        rankings: () => ({ scores: [] }),
        livePlayers: () => beacons,
        online: (k: string) => k === friend.key,
        status: () => ({ running: true }),
      }),
      zoneKeys: () => [],
      tables: () => [],
      openProfile: () => {},
      openFriend: () => {},
      messages: fakeCommunityMessages({ }),
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
  // L'onglet Amis (21/11/2026) compte toujours mes amis en ligne ; les autres, au-delà de cinq seulement.
  assert.equal(few.tabs[0], '1');
  assert.ok(few.tabs.slice(1).every((c) => c === ''), few.tabs.join('|'));
  // Huit inconnus et Bruno : neuf en ligne, dont neuf en France.
  const many = views(8);
  assert.match(many.stats, /^9 joueurs en ligne · 8 en France · 1 ami$/);
  assert.equal(many.tabs[1], '9', 'l’onglet Tous');
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
