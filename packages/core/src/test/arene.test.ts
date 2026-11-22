// Arène (21/11/2026, planche « Engagement » validée) : le médaillon de ce qui se joue contre les autres.
// Ces tests fixent les invariants de la planche : seulement des données réelles (une page ou une
// section sans donnée n'existe pas, ce qui n'existe pas encore a son onglet grisé avec sa raison),
// l'ordre de la roue, l'écran à onglets générique (flippers, MagnaSave, Exit), et le câblage.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { arenaBoardPages, arenaLevelBand, arenaMoment, arenaRecords, arenaRivals, dmdNumber, gameReach, levelBandLines } from '../arena';
import { setLanguage } from '../i18n';
import { arenaDmdPages, DMD_HEIGHT, DMD_WIDTH, liveDmdPages } from '../livedmd';
import { dayKey, emptyLevels, levelStart, XP } from '../levels';
import { medallionWheel, type Medallion } from '../jukebox-screens';
import { DEFAULT_MENU_MEDIA_SETTINGS, normalizeMenuMediaSettings } from '../mediaview';
import type { RankedScore, RankingStore } from '../rankings';
import { fakeSocialNet } from './doublures';
import { frontendSource } from './frontend-source';
import { REPO_ROOT } from './i18n-scan';

setLanguage('fr');

const NOW = new Date('2026-11-21T20:40:00');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const ME = 'a'.repeat(64);
const LEA = 'e'.repeat(64);
const PAUL = 'f'.repeat(64);
const facts = new Proxy({ games: 84, tables: 21, seconds: 30 * 3600, longestTable: 4 * 3600, records: 6, championTables: 0, beaten: 21 }, { get: (o: Record<string, number>, k: string) => o[k] ?? 0 }) as never;

function score(key: string, name: string, board: string, title: string, value: number, min: number): RankedScore {
  return { key, name, board, table: { title }, score: value, at: ago(min), how: 'rom', sig: '' };
}

const store = (): RankingStore => ({
  v: 1,
  hidden: [],
  scores: [
    score(PAUL, 'Paul', 'afm', 'Attack from Mars', 10_340_000, 2400),
    score(LEA, 'Léa', 'afm', 'Attack from Mars', 9_450_000, 20),
    score(ME, 'Kiko', 'afm', 'Attack from Mars', 8_912_340, 1500),
    score(ME, 'Kiko', 'afm', 'Attack from Mars', 7_000_000, 3000),
    score(PAUL, 'Paul', 'tz', 'Twilight Zone', 698_400_120, 7000),
    score(ME, 'Kiko', 'tz', 'Twilight Zone', 640_120_300, 300),
    score(ME, 'Kiko', 'mm', 'Medieval Madness', 3_980_000, 4000),
  ],
});

// ---------- Le niveau ----------

test('niveau : ce qu’une partie peut encore rapporter, la première du jour comprise, jamais au-delà du plafond', () => {
  const fresh = { days: {} };
  assert.equal(gameReach(fresh, NOW), XP.game + 10 * XP.minute + XP.personalBest + XP.firstOfDay);
  const played = { days: { [dayKey(NOW)]: { xp: 100, seconds: 600, games: 1 } } };
  assert.equal(gameReach(played, NOW), XP.game + 10 * XP.minute + XP.personalBest, 'la première du jour est déjà jouée');
  const capped = { days: { [dayKey(NOW)]: { xp: 590, seconds: 9000, games: 12 } } };
  assert.equal(gameReach(capped, NOW), 10, 'le plafond du jour retient le reste');
});

test('niveau : la bande dit ce qu’il manque, le prochain palier et le badge le plus proche', () => {
  const state = { ...emptyLevels(), xp: levelStart(12) + 270 };
  const b = arenaLevelBand(state, [], facts, NOW);
  assert.equal(b.level, 12);
  assert.equal(b.tierLabel, 'Flippeur');
  assert.equal(b.missing, 380);
  assert.deepEqual(b.nextTier, { level: 20, label: 'Habitué' });
  assert.ok(b.reachShare > 0 && b.progress + b.reachShare <= 1, 'les hachures tiennent dans la barre');
  assert.ok(b.badge, 'un badge entamé : le plus proche');
  const lines = levelBandLines(b);
  assert.match(lines[0]!, /Une partie peut rapporter jusqu’à 65 XP aujourd’hui/, 'au-delà de trois parties : ce qu’une partie rapporte, pas un compte qui décourage');
  assert.match(lines[1]!, /Palier Habitué au niveau 20/);
  // Une partie suffit : elle le dit.
  const close = arenaLevelBand({ ...emptyLevels(), xp: levelStart(13) - 30 }, [], facts, NOW);
  assert.equal(levelBandLines(close)[0], 'Une partie peut suffire');
});

// ---------- Rivaux et records ----------

test('rivaux : le joueur juste devant moi, l’écart, et s’il vient de me passer devant', () => {
  const rivals = arenaRivals(store(), ME);
  assert.deepEqual(
    rivals.map((r) => [r.table.title, r.rival.name, r.gap, r.passed, r.mine.rank]),
    [
      ['Attack from Mars', 'Léa', 537_660, true, 3],
      ['Twilight Zone', 'Paul', 58_279_820, false, 2],
    ],
    'celle qui vient de me passer devant d’abord ; MM : personne devant moi, pas de rival',
  );
  // Un score masqué sur cette borne ne compte pas.
  const s = store();
  s.hidden.push(`k:${LEA}`);
  assert.equal(arenaRivals(s, ME)[0]!.rival.name, 'Paul');
  assert.deepEqual(arenaRivals({ v: 1, hidden: [], scores: [] }, ME), [], 'rien de publié : aucun rival');
});

test('records : mon meilleur score par table, ma place, les plus récents d’abord', () => {
  const records = arenaRecords(store(), ME);
  assert.deepEqual(
    records.map((r) => [r.table.title, r.score, r.rank, r.players]),
    [
      ['Twilight Zone', 640_120_300, 2, 2],
      ['Attack from Mars', 8_912_340, 3, 3],
      ['Medieval Madness', 3_980_000, 1, 1],
    ],
  );
});

// ---------- L'action du moment ----------

test('action du moment : la plus pressante parmi ce qui existe, rien sinon', () => {
  const rivals = arenaRivals(store(), ME);
  const open = [{ id: 'g', title: 'TZ', host: { key: PAUL, name: 'Paul' }, seats: [{ key: PAUL, name: 'Paul' }], max: 4, joinable: true }];
  const band = arenaLevelBand({ ...emptyLevels(), xp: levelStart(12) + 270 }, [], facts, NOW);
  assert.equal(arenaMoment({ mine: { title: 'TZ', seated: 1, max: 2 }, open, rivals, band, playedToday: false, now: NOW })?.kind, 'my-game');
  assert.equal(arenaMoment({ open, rivals, band, playedToday: false, now: NOW })?.kind, 'rival', 'une place prise il y a 20 min : en tête (planche validée)');
  assert.equal(arenaMoment({ open, rivals: rivals.slice(1), band, playedToday: false, now: NOW })?.kind, 'open-game');
  assert.equal(arenaMoment({ open: [], rivals: [], band, playedToday: false, now: NOW })?.kind, 'first-of-day');
  assert.equal(arenaMoment({ open: [], rivals: [], band, playedToday: true, now: NOW }), undefined, 'rien de pressant : pas de carte inventée');
});

// ---------- Le tableau à points ----------

test('tableau à points : une page par donnée réelle, la plus pressante d’abord ; aucune donnée, aucune page', () => {
  const input = { open: [], rivals: [], records: [], ago: () => 'il y a 20 min', now: NOW };
  assert.deepEqual(arenaBoardPages(input), [], 'ni ligue, ni défi, ni rendez-vous inventés');
  const rivals = arenaRivals(store(), ME);
  const records = arenaRecords(store(), ME);
  const open = [{ id: 'g', title: 'Twilight Zone', host: { key: PAUL, name: 'Paul' }, seats: [{ key: PAUL, name: 'Paul' }], max: 4, joinable: true }];
  const pages = arenaBoardPages({ ...input, open, rivals, records, standing: { world: { rank: 412, players: 2310 } } });
  assert.deepEqual(pages.map((p) => p.id), ['rival', 'open-game', 'standing', 'records']);
  const rival = pages[0]!;
  assert.equal(rival.lines[0]!.cells[0]!.text, 'Votre place est prise');
  assert.deepEqual(rival.lines[2]!.cells.map((c) => c.text), ['2 Léa', '9.450.000']);
  assert.equal(rival.lines[4]!.cells[0]!.text, 'À reprendre : 537.660');
  assert.equal(rival.foot, 'Léa vous a dépassé il y a 20 min');
  for (const p of pages) assert.ok(p.lines.length <= 5, `${p.id} : cinq lignes au plus sur le tableau`);
  assert.equal(dmdNumber(9_450_000), '9.450.000');
});

test('DMD : le tableau sur le vrai DMD, des écrans de trois lignes, l’intitulé repris, rien dans les marges, puis la marque', () => {
  const pages = arenaBoardPages({ open: [], rivals: arenaRivals(store(), ME), records: arenaRecords(store(), ME), ago: () => 'il y a 20 min', now: NOW });
  const screens = arenaDmdPages(pages);
  // Rival (5 lignes) : 2 écrans ; records (4 lignes) : 2 écrans.
  assert.equal(screens.length, 4);
  for (const s of screens) {
    assert.equal(s.id, 'arena');
    const dots = s.dots(0);
    assert.ok(dots.some((d) => d > 0), 'un écran allumé');
    for (let y = 0; y < DMD_HEIGHT; y++)
      for (const x of [0, 1, 2, DMD_WIDTH - 3, DMD_WIDTH - 2, DMD_WIDTH - 1]) assert.equal(dots[y * DMD_WIDTH + x], 0, `marge allumée en ${x}, ${y}`);
  }
  const program = liveDmdPages({ arena: pages });
  assert.equal(program[0]!.id, 'arena');
  assert.equal(program.at(-1)!.id, 'brand', 'la marque ferme le cycle');
  assert.equal(liveDmdPages({ arena: [] })[0]!.id, 'brand', 'aucune donnée : la marque, comme avant');
});

// ---------- La roue et le réglage ----------

test('roue : Juke-box · Communauté · Arène · Collections, puis les tables', () => {
  const leads: Medallion[] = ['jukebox', 'community', 'arena', 'collections'];
  const on = medallionWheel({ tables: 5, at: 0, leads, selected: 'arena' });
  assert.equal(on.position, 3);
  assert.deepEqual(on.places.find((p) => p.offset === -1), { offset: -1, medallion: 'community' });
  assert.deepEqual(on.places.find((p) => p.offset === 1), { offset: 1, medallion: 'collections' });
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.arena, true);
  assert.equal(normalizeMenuMediaSettings({}).arena, true, 'une borne d’avant ce réglage voit le médaillon');
  assert.equal(normalizeMenuMediaSettings({ arena: false }).arena, false);
});

// ---------- L'écran à onglets ----------

interface HubBuilt {
  heading: string;
  actions: { label: string; key?: string; run: () => void }[];
  back: () => void;
  hint?: string;
  keys?: (input: { code: string }) => boolean;
  hub: { tabs: { label: string; current: boolean; disabled?: string; action?: number }[]; sections: { title?: string; cards: { title: string; action?: number; buttons?: { action: number }[] }[] }[] };
}

function arena(overrides: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createArenaMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'arena-menu.js')) as { createArenaMenu(host: unknown): { openHome(back: () => void): void; poster(): { pages: unknown[]; chips: unknown[]; live?: unknown } } };
  let opened: { build: () => HubBuilt; at?: number } | undefined;
  const events: string[] = [];
  const levels = { ...emptyLevels(), xp: levelStart(12) + 270, days: { [dayKey(NOW)]: { xp: 0, seconds: 0, games: 1 } } };
  const menu = createArenaMenu({
    library: { openCustom: (build: () => HubBuilt, at?: number) => (opened = { build, at }) },
    net: fakeSocialNet({ state: () => ({ key: { publicKey: ME }, badges: [] }) }),
    levels: { state: () => levels, facts: () => facts },
    instant: { door: () => ({ detail: 'Aucune partie ouverte : lancez la vôtre', quiet: false }), arena: () => ({ open: [] }), open: () => events.push('parties'), openNew: () => events.push('ouvrir') },
    rankings: { standing: () => undefined, open: () => events.push('classements') },
    level: { open: () => events.push('niveau'), openBadges: () => events.push('badges'), openRules: () => events.push('barème') },
    history: { open: () => events.push('historique') },
    players: () => [],
    zoneKeys: () => ['MagnaLeft', 'MagnaRight'],
    navKeys: () => ({ previous: ['FlipLeft'], next: ['FlipRight'] }),
    now: () => NOW,
    ...overrides,
  });
  const built = () => opened!.build();
  /** Start sur l'action de cette clé (un bloc au premier niveau, un élément dans un bloc). */
  const run = (key: string) => built().actions.find((a) => a.key === key)!.run();
  /**
   * Un onglet : jusqu'à la barre d'onglets (sortir du bloc où l'on est, puis Start sur la barre, ou Exit
   * depuis un onglet en liste, où elle n'est pas un arrêt), puis Start sur lui.
   */
  const tab = (id: string) => {
    for (let i = 0; i < 3 && !built().actions.some((a) => a.key!.startsWith('tab:')); i++) {
      if (built().actions.some((a) => a.key === 'block:tabs')) run('block:tabs');
      else built().back();
    }
    run(`tab:${id}`);
  };
  /** Un élément nommé, où qu'il soit : chaque bloc à tour de rôle, on y entre, on le cherche, on ressort. */
  const item = (label: string) => {
    if (built().actions.some((a) => a.key!.startsWith('tab:'))) built().actions[opened!.at!]!.run();
    // Resté dans un bloc (l'écran ouvert de là n'est pas revenu) : on en ressort d'abord.
    if (!built().actions.some((a) => a.key!.startsWith('block:'))) built().back();
    // Une entrée du bas d'une section (choix), ou un élément d'un onglet en liste : un arrêt direct au premier niveau.
    const direct = built().actions.find((a) => (a.key!.startsWith('block:choice:') || a.key!.startsWith('block:item:')) && a.label === label);
    if (direct) return direct.run();
    for (const key of built().actions.map((a) => a.key!).filter((k) => k.startsWith('block:section:'))) {
      run(key);
      const found = built().actions.find((a) => a.label === label);
      if (found) return found.run();
      // Entré dans le bloc : on en ressort (un bloc d'une seule action l'a faite, sans y entrer).
      if (!built().actions.some((a) => a.key!.startsWith('block:'))) built().back();
    }
    throw new Error(`« ${label} » introuvable`);
  };
  return { menu, events, built, at: () => opened!.at, run, tab, item };
}

test('écran de l’Arène : onglets à icônes, ceux qui n’existent pas encore grisés avec leur raison et sautés', () => {
  const h = arena();
  h.menu.openHome(() => h.events.push('roue'));
  const b = h.built();
  // Les six onglets de la planche validée ; les classements vivent dans Progression.
  assert.deepEqual(b.hub.tabs.map((t) => t.label), ['Accueil', 'Parties', 'Défis', 'Du jour', 'Ligue', 'Progression']);
  for (const id of ['Défis', 'Du jour', 'Ligue']) assert.equal(b.hub.tabs.find((t) => t.label === id)!.disabled, 'Bientôt', `${id} : grisé avec sa raison`);
  assert.equal(b.hub.tabs[0]!.current, true);
  // Dans la barre d'onglets : seulement ceux qui s'ouvrent, le curseur sur l'onglet ouvert.
  assert.deepEqual(h.built().actions.map((a) => a.key), ['tab:home', 'tab:games', 'tab:progress'], 'Défis, Du jour et Ligue : ni flipper ni clic ne les ouvrent');
  assert.equal(h.at(), 0);
  for (const [code, key, label] of [['FlipRight', 'tab:games', 'Parties'], ['FlipRight', 'tab:progress', 'Progression'], ['FlipLeft', 'tab:games', 'Parties'], ['FlipLeft', 'tab:home', 'Accueil']] as const) {
    assert.ok(h.built().keys!({ code }));
    assert.equal(h.built().actions[h.at()!]!.key, key);
    assert.equal(h.built().hub.tabs.find((tab) => tab.current)?.label, label);
  }
  // Exit depuis la barre d'onglets : la roue (règle du 22/11/2026, « exit à nouveau : on sort de l'écran »).
  h.built().back();
  assert.deepEqual(h.events, ['roue']);
  h.events.length = 0;
  h.menu.openHome(() => h.events.push('roue'));
  // Aucune section de ce qui n'existe pas encore (ligue, missions, rendez-vous, défis, série).
  const titles = b.hub.sections.map((s) => s.title ?? '');
  for (const absent of ['Ligue', 'Missions', 'Défi', 'Série', 'Vendredi']) assert.ok(!titles.some((t) => t.includes(absent)), `pas de section « ${absent} »`);
  assert.ok(titles.includes('Ce que rapportent les XP'), 'le barème, d’après levels.ts');
  // MagnaSave : l'onglet suivant qui s'ouvre (Parties), puis Progression (Défis, Du jour et Ligue sautés).
  assert.equal(b.keys!({ code: 'MagnaRight' }), true);
  assert.equal(h.built().hub.tabs.find((t) => t.current)!.label, 'Parties');
  h.built().keys!({ code: 'MagnaRight' });
  assert.equal(h.built().hub.tabs.find((t) => t.current)!.label, 'Progression');
  h.built().keys!({ code: 'MagnaLeft' });
  assert.equal(h.built().hub.tabs.find((t) => t.current)!.label, 'Parties', 'le MagnaSave gauche revient en arrière');
  // Exit : la barre d'onglets, le curseur sur l'onglet ouvert ; Exit à nouveau : la roue.
  h.built().back();
  assert.deepEqual(h.built().actions.map((a) => a.key), ['tab:home', 'tab:games', 'tab:progress']);
  assert.equal(h.at(), 1, 'sur Parties, l’onglet ouvert');
  assert.match(h.built().hint!, /Exit : retour à la roue/);
  assert.deepEqual(h.events, []);
  h.built().back();
  assert.deepEqual(h.events, ['roue']);
});

test('navigation par blocs : les flippers vont de bloc en bloc, Start entre, Exit ressort, puis revient à la roue', () => {
  // Léa vient de me passer devant sur Attack from Mars : la carte du moment a deux boutons.
  const h = arena({ net: fakeSocialNet({ state: () => ({ key: { publicKey: ME }, badges: [] }), rankings: () => store() }), table: { has: () => true, go: () => h.events.push('table') } });
  h.menu.openHome(() => h.events.push('roue'));
  h.run('tab:home');
  const b = h.built();
  // Premier niveau : une action par bloc, la barre d'onglets d'abord, puis chaque section qui a de quoi agir.
  assert.ok(b.actions.every((a) => a.key!.startsWith('block:')), b.actions.map((a) => a.key).join(', '));
  assert.equal(b.actions[0]!.key, 'block:tabs');
  assert.equal(h.at(), 1, 'Start place le curseur sur le premier bloc du contenu');
  // Les blocs de l'Accueil : la barre d'onglets, la carte du moment, jouer, classements, progression, et
  // sous chacune ses entrées, en lignes d'actions (un arrêt chacune, 21/11/2026) ; le barème des XP se lit
  // seulement : ce n'est pas un bloc (aucun arrêt pour rien).
  assert.deepEqual(b.actions.map((a) => a.label), ['Onglets', 'vous a dépassé sur Attack from Mars', 'Ouvrir une partie instantanée', 'Toutes les parties instantanées', 'Vos classements', 'Tous les classements', 'Votre progression', 'Mes badges']);
  // Start sur un bloc à plusieurs actions : on y entre ; seules ses actions se choisissent.
  h.run('block:section:0');
  const inside = h.built();
  assert.deepEqual(inside.actions.map((a) => a.label), ['Aller à la table', 'Classements']);
  assert.equal(h.at(), 0, 'le curseur sur la première action du bloc');
  // Exit dans le bloc : on en ressort, le curseur sur lui ; Exit au premier niveau : la barre d'onglets
  // (sur l'onglet ouvert) ; Exit à nouveau : la roue.
  inside.back();
  assert.equal(h.at(), 1);
  assert.deepEqual(h.events, []);
  assert.match(h.built().hint!, /Exit : retour aux onglets/);
  h.built().back();
  assert.equal(h.built().actions[0]!.key, 'tab:home');
  assert.equal(h.at(), 0);
  assert.deepEqual(h.events, []);
  h.built().back();
  assert.deepEqual(h.events, ['roue']);
});

test('navigation par blocs : Start sur un onglet montre son contenu, le curseur sur son premier bloc ; MagnaSave change d’onglet', () => {
  const h = arena();
  h.menu.openHome(() => undefined);
  h.tab('progress');
  assert.equal(h.built().hub.tabs.find((t) => t.current)!.label, 'Progression');
  // Progression est en liste : la barre d'onglets n'en est pas un arrêt, le curseur sur le premier élément.
  assert.equal(h.at(), 0, 'le premier élément du contenu');
  assert.ok(h.built().actions.every((a) => a.key!.startsWith('block:item:') || a.key!.startsWith('block:choice:')), 'chaque élément, directement');
  // MagnaSave : l'onglet suivant qui s'ouvre, en boucle (Défis, Du jour et Ligue sautés).
  assert.equal(h.built().keys!({ code: 'MagnaRight' }), true);
  assert.equal(h.built().hub.tabs.find((t) => t.current)!.label, 'Accueil');
  h.built().keys!({ code: 'MagnaLeft' });
  assert.equal(h.built().hub.tabs.find((t) => t.current)!.label, 'Progression', 'le MagnaSave gauche revient en arrière');
});

test('écran de l’Arène : l’onglet « Du jour » s’ouvre dès que les tables du jour existent ; un bloc d’une seule action la fait tout de suite', () => {
  const h = arena({ daily: { detail: () => '3 tables jouées aujourd’hui', open: () => h.events.push('du jour') } });
  h.menu.openHome(() => undefined);
  assert.equal(h.built().hub.tabs.find((t) => t.label === 'Du jour')!.disabled, undefined);
  h.tab('daily');
  h.item('Les plus jouées aujourd’hui');
  assert.equal(h.events.at(-1), 'du jour', 'Start sur l’entrée : son écran, sans bloc où entrer');
});

test('Accueil de l’Arène : jouer, les classements et la progression à un Start, sans passer par les autres onglets', () => {
  // Demande du 21/11/2026 : « qu'il n'ait pas à se balader dans les onglets, sauf pour des actions spécifiques ».
  const h = arena({
    net: fakeSocialNet({ state: () => ({ key: { publicKey: ME }, badges: [] }), rankings: () => store() }),
    rankings: { standing: () => ({ world: { rank: 412, players: 2310 }, country: { code: 'FR', rank: 37, players: 418 } }), open: () => h.events.push('classements') },
    daily: { detail: () => '3 tables jouées aujourd’hui', open: () => h.events.push('du jour') },
  });
  h.menu.openHome(() => undefined);
  const titles = h.built().hub.sections.map((s) => s.title ?? '');
  for (const t of ['À jouer maintenant', 'Vos classements', 'Votre progression']) assert.ok(titles.includes(t), `bloc « ${t} »`);
  for (const [label, event] of [['Tous les classements', 'classements'], ['412ᵉ au monde', 'classements'], ['Les tables du jour', 'du jour'], ['Ouvrir une partie instantanée', 'ouvrir'], ['Toutes les parties instantanées', 'parties'], ['Mes badges', 'badges']] as const) {
    h.item(label);
    assert.equal(h.events.at(-1), event, label);
    assert.equal(h.built().hub.tabs.find((t) => t.current)!.label, 'Accueil', `${label} : sans changer d’onglet`);
  }
  // Le joueur juste devant moi sur une autre table que celle de la carte du moment : dans les classements.
  assert.ok(h.built().hub.sections.find((s) => s.title === 'Vos classements')!.cards.some((c) => /Twilight Zone/.test(c.title)));
});

test('Accueil de l’Arène : le classement mondial juste sous le moment, les premiers puis moi, chacun ouvre le classement complet', () => {
  // Demande du 22/11/2026 : « l'accès ou la visibilité hyper rapide du classement global ».
  const asked: string[] = [];
  const lines = [
    { rank: 1, key: 'cle-nova-000001', name: 'Nova', xp: 91_000, level: 41, country: 'FR' },
    { rank: 2, key: 'cle-dora-000002', name: 'Dora', xp: 88_500, level: 40 },
    { rank: 3, key: 'cle-max-0000003', name: 'Max', xp: 80_200, level: 38, country: 'BE' },
    { rank: 412, key: ME, name: 'Moi', xp: levelStart(12) + 270, mine: true as const },
  ];
  const h = arena({
    rankings: {
      standing: () => ({ world: { rank: 412, players: 2310 }, country: { code: 'FR', rank: 37, players: 418 } }),
      open: () => h.events.push('classements'),
      playersTop: (scope: string, period: string, n: number) => (asked.push(`${scope}:${period}:${n}`), { lines, players: 2310 }),
      openPlayers: (_back: () => void, label: string, scope: string, period: string) => h.events.push(`joueurs ${scope} ${period} · ${label}`),
    },
  });
  h.menu.openHome(() => undefined);
  const sections = h.built().hub.sections;
  assert.equal(sections[0]!.title, 'Classement mondial', 'le premier bloc sous le moment (ici, pas de moment)');
  assert.deepEqual(asked.at(-1), 'world:all:3', 'les trois premiers du monde, de tout temps');
  assert.deepEqual(sections[0]!.cards.map((c) => c.title), ['1ᵉʳ · Nova', '2ᵉ · Dora', '3ᵉ · Max', '412ᵉ · Vous']);
  assert.deepEqual((sections[0] as { choices?: { title: string }[] }).choices?.map((c) => c.title), ['Tout le classement mondial'], 'en ligne d’action sous le tableau');
  // Ma place au monde n'est pas répétée dans « Vos classements » ; celle de mon pays y reste, et ouvre son classement.
  const mine = sections.find((s) => s.title === 'Vos classements')!.cards.map((c) => c.title);
  assert.deepEqual(mine, ['France : 37ᵉ']);
  for (const label of ['3ᵉ · Max', 'Tout le classement mondial']) {
    h.item(label);
    assert.equal(h.events.at(-1), 'joueurs world all · Retour : Arène', label);
  }
  // Une seule ligne dans le bloc : Start dessus la fait tout de suite.
  h.built().actions.find((a) => a.label === 'Vos classements')!.run();
  assert.equal(h.events.at(-1), 'joueurs country all · Retour : Arène');
});

test('onglets hors Accueil : en liste, chaque élément est un arrêt direct des flippers, sans bloc où entrer', () => {
  // Règle du 22/11/2026 : « les onglets autres que l'accueil doivent éviter les navigations par bloc ».
  const h = arena();
  h.menu.openHome(() => h.events.push('roue'));
  h.tab('progress');
  const b = h.built();
  const keys = b.actions.map((a) => a.key!);
  assert.ok(!keys.includes('block:tabs'), 'la barre d’onglets n’est pas un élément de la liste : Exit y mène');
  assert.ok(!keys.some((k) => k.startsWith('block:section:')), `aucun bloc de section : ${keys.join(', ')}`);
  assert.equal(h.at(), 0, 'le curseur sur le premier élément du contenu');
  assert.match(b.hint!, /Flippers : choisir · Start : valider · Exit : retour aux onglets/);
  // Aucune section sous liseré ; chaque ligne porte son arrêt.
  assert.ok(b.hub.sections.every((s) => !(s as { block?: unknown }).block));
  const level = b.actions.find((a) => a.label === 'Mon niveau')!;
  level.run();
  assert.equal(h.events.at(-1), 'niveau', 'Start sur la ligne : son écran, tout de suite');
  // Exit : la barre d'onglets, sur Progression ; Exit à nouveau : la roue.
  h.built().back();
  assert.equal(h.built().hub.tabs.find((t) => t.current)!.label, 'Progression');
  assert.ok(h.built().actions.every((a) => a.key!.startsWith('tab:')));
  assert.equal(h.events.at(-1), 'niveau');
  h.built().back();
  assert.equal(h.events.at(-1), 'roue');
  // L'Accueil garde ses blocs (résumés, accès rapides).
  h.menu.openHome(() => undefined);
  h.run('tab:home');
  assert.ok(h.built().actions.some((a) => a.key!.startsWith('block:section:')));
});

test('onglet Scores : les tables jouées récemment, Start ouvre leur tableau ; toutes les tables et le classement des joueurs dessous', () => {
  // Demande du 22/11/2026 : « un onglet de score, tout simplement, pour arriver directement sur les tableaux des scores ».
  const reef = { file: 'reef.vpx', title: 'Thunder Reef' }, abyss = { file: 'abyss.vpx', title: 'Neon Abyss' };
  const h = arena({
    rankings: {
      standing: () => undefined,
      open: () => h.events.push('classements'),
      recentScores: () => ({
        where: 'Mondial · Tout temps',
        rows: [
          { table: reef, ago: 'hier', lead: '1. Paul · 698 400 120', count: '14 joueurs', mine: 'vous êtes 2ᵉ' },
          { table: abyss, ago: 'il y a 3 j', reason: 'Aucun score de tout temps' },
        ],
      }),
      openTableScores: (table: { title: string }) => h.events.push(`tableau ${table.title}`),
      openTables: (_back: () => void, label: string) => h.events.push(`tables · ${label}`),
      openPlayers: (_back: () => void, label: string, scope: string) => h.events.push(`joueurs ${scope} · ${label}`),
    },
  });
  h.menu.openHome(() => undefined);
  assert.deepEqual(h.built().hub.tabs.map((t) => t.label), ['Accueil', 'Parties', 'Scores', 'Défis', 'Du jour', 'Ligue', 'Progression']);
  h.tab('scores');
  const s = h.built().hub.sections[0]!;
  assert.equal(s.title, 'Jouées récemment');
  assert.deepEqual(s.cards.map((c) => c.title), ['Thunder Reef', 'Neon Abyss']);
  // Le premier élément est sous le curseur : un Start, et c'est le tableau.
  assert.equal(h.at(), 0);
  h.built().actions[h.at()!]!.run();
  assert.equal(h.events.at(-1), 'tableau Thunder Reef');
  for (const [label, event] of [['Toutes les tables', 'tables · Retour : Arène'], ['Classement des joueurs', 'joueurs world · Retour : Arène']] as const) {
    h.built().actions.find((a) => a.label === label)!.run();
    assert.equal(h.events.at(-1), event, label);
  }
});

test('écran de l’Arène : les cartes mènent aux écrans complets (parties, classements, progression)', () => {
  const h = arena();
  h.menu.openHome(() => undefined);
  h.tab('progress');
  for (const [title, event] of [['Mon niveau', 'niveau'], ['Tous les classements', 'classements'], ['Mes badges', 'badges'], ['Historique des parties', 'historique'], ['Comment gagner des XP', 'barème']] as const) {
    h.item(title);
    assert.equal(h.events.at(-1), event, title);
  }
  h.tab('games');
  h.item('Ouvrir une partie instantanée');
  assert.equal(h.events.at(-1), 'ouvrir');
});

test('affiche de l’Arène : sans donnée réelle, ni tableau, ni joueurs, ni puces inventés', () => {
  // Un joueur qui débute : aucune partie, aucun badge entamé, rien de publié, personne en ligne.
  const none = new Proxy({}, { get: () => 0 });
  const p = arena({ levels: { state: () => ({ ...emptyLevels(), days: {} }), facts: () => none } }).menu.poster() as unknown as { podium?: unknown; tiles: { label: string }[]; live?: unknown; chips: unknown[] };
  assert.equal(p.podium, undefined, 'personne devant moi : pas de podium');
  assert.deepEqual(p.tiles.map((t) => t.label), ['Niveau'], 'pas encore classé : ni Monde ni pays');
  assert.equal(p.live, undefined);
  assert.deepEqual(p.chips, [], 'pas de partie ouverte');
});

test('affiche de l’Arène : le podium de la table qui pique, le rival en ambre, moi en vert, ce qu’il manque pour monter', () => {
  const p = arena({ net: fakeSocialNet({ state: () => ({ key: { publicKey: ME }, badges: [] }), rankings: () => store() }) }).menu.poster() as unknown as { podium: { table: string; eyebrow: string; warn: boolean; rows: { rank: string; name: string; me?: true; rival?: true }[]; climb: { label: string; gap: string } } };
  assert.equal(p.podium.table, 'Attack from Mars');
  assert.equal(p.podium.eyebrow, 'Votre place est prise');
  assert.equal(p.podium.warn, true);
  assert.deepEqual(p.podium.rows.map((r) => [r.rank, r.name, Boolean(r.rival), Boolean(r.me)]), [
    ['1', 'Paul', false, false],
    ['2', 'Léa', true, false],
    ['3', 'Vous', false, true],
  ]);
  assert.equal(p.podium.climb.label, 'Pour la 2ᵉ place');
  assert.match(p.podium.climb.gap, /^\+537.660$/);
});

// ---------- Câblage ----------

test('frontend : le médaillon Arène est câblé comme les autres (roue, Start, clic, téléphone, affiche, rendu)', () => {
  const main = frontendSource();
  assert.match(main, /\.\.\.\(communityShown\(\) \? \(\['community'\] as const\) : \[\]\),\s*\.\.\.\(arenaShown\(\) \? \(\['arena'\] as const\) : \[\]\),\s*\.\.\.\(collectionsShown\(\)/, 'entre la Communauté et les Collections');
  assert.match(main, /button === 'confirm' && onArena\(\)/, 'Start ouvre son écran');
  assert.match(main, /action\.offset === 0 && onArena\(\)/, 'clic au centre de la roue');
  assert.match(main, /leads\.includes\('arena'\)/, 'au téléphone');
  assert.match(main, /arena: state\.phase === 'menu' && !state\.help && onArena\(\) \? \{ poster: arenaMenu\.poster\(\) \}/, 'son affiche');
  const renderer = (f: string) => fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', f), 'utf8');
  assert.match(renderer('frontend.js'), /n\.arena \? 'arene'/);
  assert.match(renderer('frontend.js'), /CyberArena\.wheelPoster/);
  assert.match(renderer('frontend.js'), /window\.CyberArena\?\.zone/);
  assert.match(renderer('library.js'), /if \(v\.hub && window\.CyberHub\)/, 'l’écran à onglets se dessine en entier');
  for (const f of ['arena.js', 'hub.js', 'arena.css', 'hub.css']) assert.match(renderer('frontend.html'), new RegExp(f.replace('.', '\\.')), `${f} chargé`);
  assert.match(renderer('medaillons-vivants.js'), /arene: \{ draw: coupe/, 'intérieur vivant « Coupe »');
  for (const f of ['arene.png', 'arene-512.webp']) assert.ok(fs.existsSync(path.join(REPO_ROOT, 'app', 'renderer', 'medaillons', f)), `${f} généré (medaillons.cjs)`);
});
