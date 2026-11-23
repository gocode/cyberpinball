// Ergonomie du front-end : ces tests fixent les invariants :
// - aucune carte qui explique un chemin sans offrir le geste : l'onglet Défis a « Lancer un défi » ;
// - un partage coupé se règle sur place (« Régler le partage »), jamais par un long chemin dans les réglages ;
// - un « Retour : X » nomme l'écran d'où l'on vient, pas un autre (les tables du jour ouvertes de l'Arène) ;
// - le libellé « À proximité » ne dit pas ce que c'est : « Sur mon réseau local ».
// Les profils (activité masquée, niveau en vérification, J'aime annoncé, trois états du mien) sont dans
// profil-social.test.ts ; les suggestions (profil d'abord, puis « Ajouter en ami ») dans communaute-onglets.test.ts.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import { REPO_ROOT } from './i18n-scan';

setLanguage('fr');

interface Built {
  heading: string;
  hub?: { sections: { title?: string; cards: { key: string }[] }[] };
  sections?: { rows: { text: string; detail?: string; action?: number }[] }[];
  actions: { label: string; key?: string; run(): void }[];
}
interface Card {
  key: string;
  title: string;
  detail?: string;
  run?(): void;
  buttons?: { label: string; key: string; off?: string; run(): void }[];
}
/* eslint-disable @typescript-eslint/no-require-imports */
const challenges = require(path.join(REPO_ROOT, 'app', 'dist', 'challenges-menu.js')) as { createChallengesMenu(h: object): { sections(here: () => void): { sections: { title?: string; cards: Card[] }[] } } };
const daily = require(path.join(REPO_ROOT, 'app', 'dist', 'daily-tables-menu.js')) as { createDailyTablesMenu(h: object): { open(back: () => void, from?: string): void } };
/* eslint-enable @typescript-eslint/no-require-imports */

function challengesMenu(over: { off?: string; sharingOff?: boolean; withTable?: boolean }) {
  const opened: Built[] = [];
  const events: string[] = [];
  const table = { id: 'mm', title: 'Medieval Madness' };
  const menu = challenges.createChallengesMenu({
    library: { openCustom: (build: () => Built) => opened.push(build()) },
    service: { unavailable: () => over.off, list: () => [], blocked: () => undefined },
    localFor: () => ({ state: 'mine', table }),
    face: (p: { key: string; name: string }) => ({ key: p.key, name: p.name, initials: 'N', hue: 0 }),
    play: () => undefined,
    versionOf: () => ({ state: 'ok', board: 'b'.repeat(64), balls: 3 }),
    myBest: () => 4_000_000,
    candidates: () => [],
    recentTables: () => (over.withTable === false ? [] : [table]),
    sharingOff: () => Boolean(over.sharingOff),
    openSharing: () => events.push('sharing'),
  });
  return { menu, opened, events };
}

test('Défis : la carte « Choisir une table, puis un joueur » a son bouton « Lancer un défi », qui ouvre le choix de la table', () => {
  const { menu, opened } = challengesMenu({});
  const card = menu.sections(() => undefined).sections.flatMap((s) => s.cards).find((c) => c.key === 'challenge:how')!;
  assert.ok(card, 'la carte est là');
  assert.ok(card.buttons?.length || card.run, 'une carte qui explique un chemin offre le geste (jamais un texte seul)');
  const launch = card.buttons!.find((b) => b.key === 'launch')!;
  assert.equal(launch.label, 'Lancer un défi');
  assert.equal(launch.off, undefined);
  launch.run();
  const screen = opened[0]!;
  assert.equal(screen.heading, 'Lancer un défi');
  assert.ok(screen.sections![0]!.rows.some((r) => r.text === 'Medieval Madness' && r.action !== undefined), 'ma table jouée, un arrêt des flippers');
  assert.ok(!JSON.stringify(card).includes('Jouer ensemble'), 'plus de chemin à deviner');
});

test('Défis sans table jouée : « Lancer un défi » grisé avec sa raison, jamais muet', () => {
  const { menu } = challengesMenu({ withTable: false });
  const card = menu.sections(() => undefined).sections.flatMap((s) => s.cards).find((c) => c.key === 'challenge:how')!;
  const launch = card.buttons![0]!;
  assert.match(launch.off ?? '', /Joue d’abord une partie/);
});

test('Défis, partage coupé : « Régler le partage » sur place, qui ouvre le réglage', () => {
  const { menu, events } = challengesMenu({ off: 'Partage désactivé : Communauté > Partage et réseau', sharingOff: true });
  const cards = menu.sections(() => undefined).sections.flatMap((s) => s.cards);
  const fix = cards.find((c) => c.key === 'challenges:sharing')!;
  assert.ok(fix?.run, 'une carte qui dit « partage désactivé » offre de le régler');
  fix.run!();
  assert.deepEqual(events, ['sharing']);
  // Borne « jeu local » (partage coupé par choix de la borne, pas par réglage) : rien à régler, rien proposé.
  const closed = challengesMenu({ off: 'Retirés : la borne joue en local', sharingOff: false });
  assert.ok(!closed.menu.sections(() => undefined).sections.flatMap((s) => s.cards).some((c) => c.key === 'challenges:sharing'));
});

test('Tables du jour : « Retour : » nomme l’écran d’origine (Arène ou Classements), jamais l’autre', () => {
  const opened: Built[] = [];
  const menu = daily.createDailyTablesMenu({
    library: { openCustom: (build: () => Built) => opened.push(build()) },
    service: { unavailable: () => 'Partage désactivé', country: () => undefined, friends: () => false, board: () => undefined },
    tables: () => [],
    play: () => undefined,
    zoneKeys: () => [],
    openSharing: () => undefined,
  });
  const backLabel = () => opened[opened.length - 1]!.actions.find((a) => a.key === 'back')!.label;
  menu.open(() => undefined);
  assert.equal(backLabel(), 'Retour : Classements', 'ouvert des Classements : par défaut');
  menu.open(() => undefined, 'Retour : Arène');
  assert.equal(backLabel(), 'Retour : Arène', 'ouvert de l’Arène : « Retour : Arène »');
  menu.open(() => undefined);
  assert.equal(backLabel(), 'Retour : Classements', 'l’origine d’avant ne reste pas collée');
});

test('l’Arène ouvre les tables du jour avec son propre retour', () => {
  const arena = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'arena-menu.ts'), 'utf8');
  const opens = arena.split(/\r?\n/).filter((l) => l.includes('daily.open('));
  assert.ok(opens.length >= 2, 'les deux entrées (porte et onglet) y mènent');
  for (const line of opens) assert.ok(line.includes("t('Retour : Arène')"), `${line.trim()} : dit d’où l’on vient`);
});

test('« À proximité » devient « Sur mon réseau local » : le filtre des joueurs et la rubrique de « Trouver un joueur »', () => {
  for (const file of ['community-menu.ts', 'friends-menu.ts']) {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', file), 'utf8');
    assert.ok(!/t\('À proximité[^']*'\)/.test(src), `${file} : plus d’« À proximité » comme libellé`);
    assert.ok(src.includes("t('Sur mon réseau local')"), `${file} : « Sur mon réseau local »`);
  }
});
