// Communauté > Classements (app/src/rankings-menu.ts). Deux retours d'essai fixent la classe :
// - 13/11/2026 : la porte ouvrait le tableau des scores de la table restée choisie dans la roue ;
// - 17/11/2026 : « ça me montre les classements d'un jeu, et pas des autres » : seules les tables
//   déjà classées avaient une ligne. Désormais :
// - l'accueil propose deux portes, « Joueurs » (par XP) et « Tables » ;
// - « Tables » montre TOUTES les tables : les dernières jouées d'abord, puis de A à Z ; une table sans
//   classement reste dans la liste, grisée, avec sa raison ; une recherche par nom les filtre ;
// - les quatre portées en onglets (MagnaSave passe à la suivante), la période se choisit ;
// - Start sur une table ouvre son tableau des scores à la même portée et à la même période, dont le
//   « Retour » revient à la liste des tables.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { setLanguage, type RankingScope, type ScorePeriod, type TableEntry } from '../index';

interface Built {
  heading: string;
  subheading?: string;
  sections: { title?: string; rows: { text: string; detail?: string; tone?: string; action?: number; aside?: string }[] }[];
  actions: { label: string; detail?: string; tone?: string; run: () => void }[];
  tabs?: { label: string; count: string; current: boolean; disabled?: boolean; action: number }[];
  back: () => void;
  keys?: (input: { code: string }) => boolean;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createRankingsMenu, matchesSearch } = require(path.join(REPO_ROOT, 'app', 'dist', 'rankings-menu.js')) as {
  createRankingsMenu(host: object): { open(back: () => void): void; detail(): string; recentScores(n: number): { rows: { ranks?: { label: string; place: string; flag?: { code: string }; icon?: string }[] }[] } };
  matchesSearch(title: string, query: string): boolean;
};

const NOW = new Date('2026-11-17T18:00:00');
const table = (title: string, file: string, lastRun?: string): TableEntry =>
  ({ id: file, emulator: 'vpx', file: path.join('D:', 'Borne', 'tables', file), folder: path.join('D:', 'Borne', 'tables'), title, manufacturer: 'Studio Exemple', year: 2025, infoFile: '', info: lastRun ? { User: { LastRun: lastRun } } : {} }) as TableEntry;
const TABLES = [table('Atlas Rising', 'atlas.vpx'), table('Copper Comet', 'copper.vpx'), table('Lunar Diner', 'lunar.vpx', '2026-11-16T21:00:00')];

const rowsOf = (b: Built) => b.sections.flatMap((s) => s.rows);
const go = (b: Built, label: string) => {
  const a = b.actions.find((x) => x.label === label);
  assert.ok(a, `action « ${label} »`);
  a.run();
};

function harness(opts: { sharing?: boolean } = {}) {
  let screen: (() => Built) | undefined;
  const opened: { title: string; scope: RankingScope; period: ScorePeriod; back: () => void }[] = [];
  const prompts: { value: string; done: (v: string | undefined) => void }[] = [];
  const line = (rank: number, name: string, score: number, mine = false) => ({ rank, key: name, name, country: 'FR', score, at: '2026-11-13T20:00:00Z', how: 'rom', id: `${name}-${score}`, ...(mine ? { mine: true } : {}), face: {} });
  const menu = createRankingsMenu({
    library: {
      openCustom: (build: () => Built) => (screen = build),
      openScores: (t: TableEntry, scope: RankingScope, period: ScorePeriod, back: () => void) => opened.push({ title: t.title, scope, period, back }),
      openPrompt: (_h: string, _l: string, value: string, done: (v: string | undefined) => void) => prompts.push({ value, done }),
    },
    tables: () => TABLES,
    local: (t: TableEntry) => (t.title === 'Lunar Diner' ? { lines: [{ rank: 1, score: 4_200_000, initials: 'JUL', at: '2026-11-12T20:00:00Z' }], games: 3, tableBoard: true, everyGame: true, romWithoutMap: false } : { lines: [], games: 0, tableBoard: false, everyGame: false, romWithoutMap: false }),
    network: (t: TableEntry, scope: RankingScope) => {
      if (opts.sharing === false) return { lines: [], players: 0, unavailable: 'Partage désactivé : Communauté > Partage et réseau' };
      if (t.title === 'Atlas Rising') return { lines: [line(1, 'Kiko', 12_345_678), line(2, 'Moi', 9_000_000, true)], players: scope === 'world' ? 14 : 3, me: { rank: 2 } };
      if (t.title === 'Copper Comet') return { lines: [], players: 0 };
      return { lines: [], players: 0, unavailable: 'Empreinte de la table en calcul…', pending: true };
    },
    zoneKeys: () => ['ControlLeft', 'ControlRight'],
    openSharing: () => undefined,
    now: () => NOW.getTime(),
  });
  return { menu, opened, prompts, built: () => screen!() };
}

test('« Classements » : l’accueil propose deux portes, Joueurs et Tables', () => {
  setLanguage('fr');
  const h = harness();
  let backed = false;
  h.menu.open(() => (backed = true));
  const b = h.built();
  assert.equal(b.heading, 'Classements');
  assert.deepEqual(b.actions.map((a) => a.label), ['Joueurs', 'Tables', 'Retour : Communauté']);
  assert.match(h.menu.detail(), /Joueurs par XP/);
  // Sans réseau des bornes, la porte « Joueurs » est grisée et dit pourquoi.
  assert.equal(b.actions[0]!.tone, 'quiet');
  assert.match(b.actions[0]!.detail ?? '', /Indisponible/);
  b.back();
  assert.ok(backed);
});

test('« Tables » : toutes les tables, jamais seulement celles qui ont des scores ; les sans-classement grisées avec leur raison', () => {
  setLanguage('fr');
  const h = harness();
  h.menu.open(() => undefined);
  go(h.built(), 'Tables');
  const b = h.built();
  assert.equal(b.heading, 'Tables');
  assert.equal(b.subheading, 'Mondial · Tout temps');
  const rows = rowsOf(b);
  for (const title of ['Atlas Rising', 'Copper Comet', 'Lunar Diner']) assert.ok(rows.some((r) => r.text === title), `${title} a sa ligne`);
  const atlas = rows.find((r) => r.text === 'Atlas Rising')!;
  assert.match(atlas.detail ?? '', /^1\. Kiko · 12.345.678 · 14 joueurs · tu es 2ᵉ$/u);
  const copper = rows.find((r) => r.text === 'Copper Comet')!;
  assert.equal(copper.tone, 'quiet');
  assert.equal(copper.detail, 'Aucun score tout temps');
  const lunar = rows.find((r) => r.text === 'Lunar Diner')!;
  assert.equal(lunar.tone, 'quiet');
  assert.equal(lunar.detail, 'Empreinte de la table en calcul…');
  // La dernière jouée en tête, avec quand ; les autres de A à Z.
  assert.deepEqual(b.sections.map((s) => s.title).filter(Boolean), ['Jouées récemment', 'Toutes les autres tables · A–Z']);
  assert.equal(b.sections.find((s) => s.title === 'Jouées récemment')!.rows[0]!.text, 'Lunar Diner');
  assert.equal(lunar.aside, 'hier');
  // Les quatre portées en onglets, le mondial ouvert ; chaque onglet compte ses tables classées sur toutes.
  assert.deepEqual(b.tabs?.map((t) => t.label), ['Cette borne', 'Amis', 'National', 'Mondial']);
  assert.equal(b.tabs?.find((t) => t.current)?.label, 'Mondial');
  assert.equal(b.tabs?.find((t) => t.label === 'Mondial')?.count, '1 sur 3');
  // Start sur une table, même grisée : son tableau des scores à la même portée et période ; Retour revient ici.
  b.actions[copper.action!]!.run();
  b.actions[atlas.action!]!.run();
  assert.deepEqual(h.opened.map((o) => o.title), ['Copper Comet', 'Atlas Rising']);
  assert.deepEqual({ scope: h.opened[1]!.scope, period: h.opened[1]!.period }, { scope: 'world', period: 'all' });
  h.opened[1]!.back();
  assert.equal(h.built().heading, 'Tables');
  // Retour de l'écran : vers l'accueil des classements.
  h.built().back();
  assert.equal(h.built().heading, 'Classements');
});

test('« Tables » : la recherche filtre par nom, sans accents ni casse, et s’efface', () => {
  setLanguage('fr');
  assert.ok(matchesSearch('Comète Rouge', 'comete'));
  assert.ok(matchesSearch('Copper Comet', 'COM'));
  assert.ok(matchesSearch('Atlas Rising', 'ris'));
  assert.ok(matchesSearch('Spider-Man', 'spiderman'));
  assert.ok(!matchesSearch('Atlas Rising', 'lunar'));
  const h = harness();
  h.menu.open(() => undefined);
  go(h.built(), 'Tables');
  const search = rowsOf(h.built()).find((r) => r.text === 'Rechercher une table');
  assert.ok(search, 'la recherche en tête');
  h.built().actions[search.action!]!.run();
  assert.equal(h.prompts.length, 1);
  h.prompts[0]!.done('lun');
  let b = h.built();
  assert.equal(b.heading, 'Tables');
  const titles = rowsOf(b).map((r) => r.text);
  assert.ok(titles.includes('Lunar Diner') && !titles.includes('Atlas Rising') && !titles.includes('Copper Comet'), titles.join(', '));
  assert.ok(titles.includes('Recherche : « lun »'));
  // Effacer : toutes les tables reviennent.
  go(b, 'Effacer la recherche');
  b = h.built();
  assert.ok(['Atlas Rising', 'Copper Comet', 'Lunar Diner'].every((x) => rowsOf(b).some((r) => r.text === x)));
});

test('« Tables » : MagnaSave change de portée, « Période » de période ; Cette borne montre les scores relevés ici', () => {
  setLanguage('fr');
  const h = harness();
  h.menu.open(() => undefined);
  go(h.built(), 'Tables');
  // MagnaSave droite depuis Mondial : on revient sur Cette borne.
  assert.ok(h.built().keys?.({ code: 'ControlRight' }));
  const b = h.built();
  assert.equal(b.subheading, 'Cette borne · Tout temps');
  const lunar = rowsOf(b).find((r) => r.text === 'Lunar Diner');
  assert.match(lunar?.detail ?? '', /^1\. JUL · 4.200.000 · 3 parties$/u);
  const period = b.actions.find((a) => a.label.startsWith('Période'));
  assert.ok(period);
  period.run();
  assert.equal(h.built().subheading, 'Cette borne · Cette année');
});

test('« Tables » : sans partage, les portées en réseau sont grisées avec leur raison et l’écran s’ouvre sur Cette borne', () => {
  setLanguage('fr');
  const h = harness({ sharing: false });
  h.menu.open(() => undefined);
  go(h.built(), 'Tables');
  const b = h.built();
  assert.equal(b.tabs?.find((t) => t.current)?.label, 'Cette borne');
  for (const label of ['Amis', 'National', 'Mondial']) {
    const tab: NonNullable<Built['tabs']>[number] | undefined = b.tabs?.find((x) => x.label === label);
    assert.equal(tab?.disabled, true, `${label} grisé`);
    assert.match(tab?.count ?? '', /Partage désactivé/);
  }
});

// Retour du 17/11/2026 : « Empreintes de 2 tables en calcul… » restait affiché. Les empreintes, déjà
// connues, arrivaient aussitôt après l'ouverture ; l'écran se reconstruisait, mais la limite de cadence
// (deux secondes) rendait le classement de l'ouverture, et plus rien ne le redessinait. La classe : un
// changement reçu pendant la limite de cadence est toujours relu, jamais oublié.
test('« Tables » : une empreinte arrivée juste après l’ouverture se voit, un changement pendant la limite de cadence est relu à sa fin', () => {
  setLanguage('fr');
  let clock = 1_000_000;
  let ready = false;
  let leader = 'Kiko';
  let screen: (() => Built) | undefined;
  const timers: { at: number; run: () => void }[] = [];
  let redraws = 0;
  const line = (name: string, score: number) => ({ rank: 1, key: name, name, country: 'FR', score, at: '2026-11-13T20:00:00Z', how: 'rom', id: `${name}-${score}`, face: {} });
  const menu = createRankingsMenu({
    library: { openCustom: (build: () => Built) => (screen = build), openScores: () => undefined },
    tables: () => TABLES.slice(0, 2),
    local: () => ({ lines: [], games: 0, tableBoard: false, everyGame: false, romWithoutMap: false }),
    network: () => (ready ? { lines: [line(leader, 5_000_000)], players: 2 } : { lines: [], players: 0, unavailable: 'Empreinte de la table en calcul…', pending: true }),
    zoneKeys: () => [],
    openSharing: () => undefined,
    redraw: () => redraws++,
    now: () => clock,
    later: (ms: number, run: () => void) => timers.push({ at: clock + ms, run }),
  });
  const texts = () => rowsOf(screen!()).map((r) => `${r.text} ${r.detail ?? ''}`);
  menu.open(() => undefined);
  go(screen!(), 'Tables');
  assert.equal(texts().filter((t) => /en calcul/.test(t)).length, 2);
  // Les empreintes arrivent dix millisecondes plus tard : l'écran se reconstruit et les montre.
  ready = true;
  clock += 10;
  assert.ok(!texts().some((t) => /en calcul/.test(t)), 'plus d’empreinte en calcul');
  assert.ok(texts().some((t) => /Atlas Rising 1\. Kiko/.test(t)), 'la table classée a sa ligne');
  // Des classements reçus du réseau une seconde plus tard : la limite de cadence garde l'ancien, mais la relecture est prévue.
  leader = 'Nova';
  clock += 1000;
  assert.ok(texts().some((t) => /Atlas Rising 1\. Kiko/.test(t)), 'pendant la limite de cadence, le classement gardé');
  const planned = timers.length;
  assert.ok(planned >= 1, 'une relecture prévue à la fin de la limite de cadence');
  texts();
  assert.equal(timers.length, planned, 'pas une de plus à chaque reconstruction');
  // Chaque relecture prévue arrive à son heure, et l'écran se reconstruit comme après un changement.
  let last: string[] = [];
  for (let guard = 0; timers.length; guard++) {
    assert.ok(guard < 5, 'les relectures s’arrêtent quand plus rien ne change');
    timers.sort((a, b) => a.at - b.at);
    const next = timers.shift()!;
    clock = next.at;
    next.run();
    last = texts();
  }
  assert.ok(redraws >= 1, 'l’écran relit ce qu’il montre');
  assert.ok(last.some((t) => /Atlas Rising 1\. Nova/.test(t)), 'le nouveau premier se voit');
  assert.ok(clock - 1_000_000 <= 10 + 2000, 'au plus tard deux secondes après le classement gardé');
});

test('« Classements » : en anglais', () => {
  setLanguage('en');
  try {
    const h = harness();
    h.menu.open(() => undefined);
    assert.equal(h.built().heading, 'Leaderboards');
    go(h.built(), 'Tables');
    const b = h.built();
    const atlas = rowsOf(b).find((r) => r.text === 'Atlas Rising');
    assert.match(atlas?.detail ?? '', /14 players · you are #2$/);
    assert.equal(b.tabs?.find((t) => t.label === 'World')?.count, '1 of 3');
  } finally {
    setLanguage('fr');
  }
});

test('tables récentes : positions du pays et du monde distinctes, sans inventer de rang absent', () => {
  const recent = table('Atlas Rising', 'atlas.vpx', '2026-11-16T21:00:00');
  const host = {
    library: { openCustom() {}, openScores() {} }, tables: () => [recent],
    local: () => ({ lines: [], games: 0 }),
    network: (_table: TableEntry, scope: RankingScope) => ({ lines: [{ rank: 1, name: 'Alto', score: 100 }], players: 12, me: scope === 'country' ? { rank: 2 } : { rank: 7 } }),
    players: { state: () => ({ enabled: true, country: 'DE', friends: new Set<string>() }), cards: () => [] },
    zoneKeys: () => [], openSharing() {}, now: () => NOW.getTime(),
  };
  const ranks = createRankingsMenu(host).recentScores(5).rows[0]!.ranks!;
  assert.deepEqual(ranks.map((r) => [r.flag?.code, r.icon, r.place]), [['DE', undefined, '#2'], [undefined, 'globe', '#7']]);
  const missing = createRankingsMenu({ ...host, network: () => ({ lines: [], players: 0 }) }).recentScores(5).rows[0]!.ranks!;
  assert.deepEqual(missing.map((r) => r.place), ['—', '—']);
  const beyond = createRankingsMenu({ ...host, network: () => ({ lines: [], players: 100, me: { rank: 101, beyond: 100 } }) }).recentScores(5).rows[0]!.ranks!;
  assert.deepEqual(beyond.map((r) => r.place), ['>100', '>100']);
});
