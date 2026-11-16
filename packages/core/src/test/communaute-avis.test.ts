// Accueil Communauté (app/src/community-menu.ts) : « Avis et propositions » tout en bas (16/11/2026), la même
// entrée que Menu système > Cyber Pinball. Ces tests fixent :
// - la porte est la dernière avant « Retour », avec ce que dit l'entrée du menu système ;
// - Start l'ouvre avec un « Retour » qui ramène à l'accueil Communauté ;
// - sans service des retours, pas de porte (jamais une entrée morte).

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { setLanguage } from '../index';

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

test('Communauté : « Avis et propositions » tout en bas, juste avant « Retour »', () => {
  setLanguage('fr');
  const h = harness(true);
  const b = h.built();
  assert.equal(b.heading, 'Communauté');
  const labels = b.actions.map((a) => a.label);
  assert.deepEqual(labels.slice(-2), ['Avis et propositions', 'Retour']);
  const door = b.actions.at(-2)!;
  assert.equal(door.detail, '3 propositions · 1 de vous');
  assert.equal(door.icon, 'inbox');
});

test('Communauté : « Avis et propositions » revient à l’accueil Communauté', () => {
  setLanguage('fr');
  const h = harness(true);
  h.built().actions.find((a) => a.label === 'Avis et propositions')!.run();
  assert.equal(h.feedbackOpened.length, 1);
  h.feedbackOpened[0]!();
  assert.equal(h.built().heading, 'Communauté');
});

test('Communauté : sans service des retours, pas de porte', () => {
  setLanguage('fr');
  const labels = harness(false).built().actions.map((a) => a.label);
  assert.ok(!labels.includes('Avis et propositions'));
  assert.equal(labels.at(-1), 'Retour');
});
