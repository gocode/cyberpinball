// Classements de toutes mes tables (app/src/rankings-menu.ts), la porte « Classements » de l'accueil
// Communauté. Elle ouvrait le tableau des scores de la table restée choisie dans la roue (retour du
// 13/11/2026 : « pourquoi 2001, l’Odyssée de l’espace ? »). Ces tests fixent la classe :
// - l'écran parle de toutes les tables, jamais d'une seule ; une ligne par table qui a des scores,
//   avec le premier, son score, le nombre de joueurs et ma place ; les tables sans score se comptent ;
// - les quatre portées en onglets (MagnaSave passe à la suivante), la période se choisit ;
// - une portée sans réseau (partage désactivé) est grisée avec sa raison, et l'écran s'ouvre alors
//   sur « Cette borne » ;
// - Start sur une table ouvre son tableau des scores à la même portée et à la même période, dont le
//   « Retour » revient aux classements.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { setLanguage, type RankingScope, type ScorePeriod, type TableEntry } from '../index';

interface Built {
  heading: string;
  subheading?: string;
  sections: { title?: string; rows: { text: string; detail?: string; tone?: string; action?: number }[] }[];
  actions: { label: string; run: () => void }[];
  tabs?: { label: string; count: string; current: boolean; disabled?: boolean; action: number }[];
  back: () => void;
  keys?: (input: { code: string }) => boolean;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createRankingsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'rankings-menu.js')) as {
  createRankingsMenu(host: object): { open(back: () => void): void; detail(): string };
};

const table = (title: string, file: string): TableEntry => ({ id: file, emulator: 'vpx', file: path.join('D:', 'Borne', 'tables', file), folder: path.join('D:', 'Borne', 'tables'), title, manufacturer: 'Studio Exemple', year: 2025, infoFile: '', info: {} }) as TableEntry;
const TABLES = [table('Atlas Rising', 'atlas.vpx'), table('Copper Comet', 'copper.vpx'), table('Lunar Diner', 'lunar.vpx')];

function harness(opts: { sharing?: boolean } = {}) {
  let screen: (() => Built) | undefined;
  const opened: { title: string; scope: RankingScope; period: ScorePeriod; back: () => void }[] = [];
  const line = (rank: number, name: string, score: number, mine = false) => ({ rank, key: name, name, country: 'FR', score, at: '2026-11-13T20:00:00Z', how: 'rom', id: `${name}-${score}`, ...(mine ? { mine: true } : {}), face: {} });
  const menu = createRankingsMenu({
    library: {
      openCustom: (build: () => Built) => (screen = build),
      openScores: (t: TableEntry, scope: RankingScope, period: ScorePeriod, back: () => void) => opened.push({ title: t.title, scope, period, back }),
    },
    tables: () => TABLES,
    local: (t: TableEntry) => (t.title === 'Lunar Diner' ? { lines: [{ rank: 1, score: 4_200_000, initials: 'JUL', at: '2026-11-12T20:00:00Z' }], games: 3, tableBoard: true, everyGame: true, romWithoutMap: false } : { lines: [], games: 0, tableBoard: false, everyGame: false, romWithoutMap: false }),
    network: (t: TableEntry, scope: RankingScope) => {
      if (opts.sharing === false) return { lines: [], players: 0, unavailable: 'Partage désactivé : Amis > Partage et réseau' };
      if (t.title === 'Atlas Rising') return { lines: [line(1, 'Kiko', 12_345_678), line(2, 'Moi', 9_000_000, true)], players: scope === 'world' ? 14 : 3, me: { rank: 2 } };
      if (t.title === 'Copper Comet') return { lines: [], players: 0 };
      return { lines: [], players: 0, unavailable: 'Empreinte de la table en calcul…', pending: true };
    },
    zoneKeys: () => ['ControlLeft', 'ControlRight'],
    openSharing: () => undefined,
  });
  return { menu, opened, built: () => screen!() };
}

test('« Classements » : toutes les tables, une ligne par table classée, jamais une seule table', () => {
  setLanguage('fr');
  const h = harness();
  let backed = false;
  h.menu.open(() => (backed = true));
  const b = h.built();
  assert.equal(b.heading, 'Classements');
  assert.equal(b.subheading, 'Mondial · Tout temps');
  assert.match(h.menu.detail(), /Toutes vos tables/);
  const rows = b.sections.flatMap((s) => s.rows);
  const atlas = rows.find((r) => r.text === 'Atlas Rising');
  assert.ok(atlas, 'la table classée a sa ligne');
  assert.match(atlas.detail ?? '', /^1\. Kiko · 12.345.678 · 14 joueurs · vous êtes 2ᵉ$/u);
  assert.ok(!rows.some((r) => r.text === 'Copper Comet'), 'une table sans score n’a pas de ligne');
  assert.ok(rows.some((r) => /1 autre table sans score/.test(r.text)), 'elle se compte');
  assert.ok(rows.some((r) => /Empreinte de 1 table en calcul/.test(r.text)), 'une empreinte en calcul se dit');
  // Les quatre portées en onglets, le mondial ouvert.
  assert.deepEqual(b.tabs?.map((t) => t.label), ['Cette borne', 'Amis', 'National', 'Mondial']);
  assert.equal(b.tabs?.find((t) => t.current)?.label, 'Mondial');
  // Start sur la table : son tableau des scores à la même portée, période ; Retour revient ici.
  b.actions[atlas.action!]!.run();
  assert.equal(h.opened.length, 1);
  assert.deepEqual({ title: h.opened[0]!.title, scope: h.opened[0]!.scope, period: h.opened[0]!.period }, { title: 'Atlas Rising', scope: 'world', period: 'all' });
  h.opened[0]!.back();
  assert.equal(h.built().heading, 'Classements');
  // Retour de l'écran : vers l'accueil.
  h.built().back();
  assert.ok(backed);
});

test('« Classements » : MagnaSave change de portée, « Période » de période ; Cette borne montre les scores relevés ici', () => {
  setLanguage('fr');
  const h = harness();
  h.menu.open(() => undefined);
  // MagnaSave droite depuis Mondial : on revient sur Cette borne.
  assert.ok(h.built().keys?.({ code: 'ControlRight' }));
  const b = h.built();
  assert.equal(b.subheading, 'Cette borne · Tout temps');
  const lunar = b.sections.flatMap((s) => s.rows).find((r) => r.text === 'Lunar Diner');
  assert.match(lunar?.detail ?? '', /^1\. JUL · 4.200.000 · 3 parties$/u);
  const period = b.actions.find((a) => a.label.startsWith('Période'));
  assert.ok(period);
  period.run();
  assert.equal(h.built().subheading, 'Cette borne · Cette année');
});

test('« Classements » : sans partage, les portées en réseau sont grisées avec leur raison et l’écran s’ouvre sur Cette borne', () => {
  setLanguage('fr');
  const h = harness({ sharing: false });
  h.menu.open(() => undefined);
  const b = h.built();
  assert.equal(b.tabs?.find((t) => t.current)?.label, 'Cette borne');
  for (const label of ['Amis', 'National', 'Mondial']) {
    const tab: NonNullable<Built['tabs']>[number] | undefined = b.tabs?.find((x) => x.label === label);
    assert.equal(tab?.disabled, true, `${label} grisé`);
    assert.match(tab?.count ?? '', /Partage désactivé/);
  }
});

test('« Classements » : en anglais', () => {
  setLanguage('en');
  try {
    const h = harness();
    h.menu.open(() => undefined);
    const b = h.built();
    assert.equal(b.heading, 'Leaderboards');
    const atlas = b.sections.flatMap((s) => s.rows).find((r) => r.text === 'Atlas Rising');
    assert.match(atlas?.detail ?? '', /14 players · you are #2$/);
  } finally {
    setLanguage('fr');
  }
});
