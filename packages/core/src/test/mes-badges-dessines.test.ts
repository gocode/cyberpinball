// « Mes badges » montre le dessin de chaque badge (app/src/level-menu.ts, compilé ; library.js et
// niveau.js pour le rendu) : reçu, il brille (halo de sa rareté, reflet qui passe) ; pas encore,
// il est gris, éteint et immobile ; un secret pas encore reçu ne montre que son cadenas. Les
// badges les plus proches de « Mon niveau » ont le même dessin, éteint.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { test } from 'node:test';
import { BADGES } from '../badges';
import { emptyLevels } from '../levels';
import { REPO_ROOT } from './i18n-scan';
import { APP, menuRenderer } from './menu-renderer';

interface Medal {
  icon: string;
  rarity: string;
  earned: boolean;
}
interface Built {
  heading: string;
  sections: { title?: string; rows: { text: string; icon?: string; medal?: Medal }[] }[];
  actions: { label: string; run(): void }[];
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLevelMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'level-menu.js')) as {
  createLevelMenu(host: object): { open(back: () => void): void; openBadges(back: () => void): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function setup(held: string[]) {
  let last: (() => Built) | undefined;
  const menu = createLevelMenu({
    library: { openCustom: (build: () => Built) => (last = build), openSystem() {} },
    net: { state: () => ({ badges: held.map((id) => ({ id, at: '2026-11-01T20:00:00.000Z' })), key: { publicKey: 'CLE-ESSAI' }, name: 'Joueur essai' }), avatarFile: () => undefined },
    levels: { state: () => emptyLevels(), facts: () => ({ games: 3, tables: 2, seconds: 600, longestTable: 300, records: 0, championTables: 0 }) },
    openProfile() {},
    now: () => new Date('2026-11-17T12:00:00Z'),
  });
  return { menu, last: () => last!() };
}

test('Mes badges : chaque badge a son dessin, brillant reçu, éteint avant, cadenas pour un secret', () => {
  const { menu, last } = setup(['first-game']);
  menu.openBadges(() => {});
  const built = last();
  assert.equal(built.heading, 'Mes badges');
  const rows = built.sections.flatMap((s) => s.rows);
  assert.equal(rows.length, BADGES.length, 'une ligne par badge');
  for (const row of rows) assert.ok(row.medal && ['common', 'rare', 'epic', 'legendary'].includes(row.medal.rarity), `« ${row.text} » sans son dessin`);
  const rarities = (list: readonly { rarity: string }[]) => list.map((x) => x.rarity).sort();
  assert.deepEqual(rarities(rows.map((r) => r.medal!)), rarities(BADGES), 'chaque badge dans sa rareté');
  const got = rows.filter((r) => r.medal!.earned);
  assert.deepEqual(got.map((r) => r.medal!.icon), ['play'], 'seul le badge reçu brille');
  const secret = rows.find((r) => r.text === 'Badge secret')!;
  assert.deepEqual(secret.medal, { icon: 'lock', rarity: secret.medal!.rarity, earned: false }, 'un secret pas encore reçu : son cadenas, éteint');
});

test('Mon niveau : les badges les plus proches ont leur dessin, éteint', () => {
  const { menu, last } = setup([]);
  menu.open(() => {});
  const near = last().sections.find((s) => s.title === 'Badges les plus proches');
  assert.ok(near?.rows.length);
  for (const row of near.rows) assert.equal(row.medal?.earned, false, `« ${row.text} »`);
});

test('rendu : le badge reçu brille et son reflet passe ; celui à obtenir est gris, sans reflet ni icône en double', () => {
  const { document, send, window } = menuRenderer({ matchMedia: () => ({ matches: false }) });
  vm.runInContext(fs.readFileSync(path.join(APP, 'renderer', 'niveau.js'), 'utf8'), window as vm.Context, { filename: 'niveau.js' });
  const rows = [
    { text: 'Première partie', icon: 'play', medal: { icon: 'play', rarity: 'common', earned: true }, aside: '+50 XP', tone: 'ok' },
    { text: 'Explorateur', icon: 'tables', medal: { icon: 'tables', rarity: 'legendary', earned: false }, aside: '2 / 25' },
  ];
  send({ role: 'playfield', phase: 'library', help: false, count: 1, position: 1, neighbors: [], footer: [], gameKeys: [], menuKeys: [], nav: {}, library: { screen: 'custom', heading: 'Mes badges', back: 'Retour', hint: '', sections: [{ title: 'Parcours', rows }], cursor: 0, actions: [{ label: 'Retour' }] } });
  const lines = [...document.querySelectorAll('.lib-row')].filter((li) => li.querySelector('.lib-row-medal'));
  assert.equal(lines.length, 2);
  const [earned, locked] = lines.map((li) => li.querySelector('.lib-row-medal')!);
  assert.match(earned!.className, /\bmedal-earned\b/);
  assert.match(earned!.className, /\brarity-common\b/);
  assert.ok(earned!.querySelector('svg animate'), 'le reflet passe sur un badge reçu');
  assert.match(locked!.className, /\bmedal-locked\b/);
  assert.ok(locked!.querySelector('svg'), 'le badge à obtenir est dessiné');
  assert.equal(locked!.querySelector('animate'), null, 'pas de reflet sur un badge pas encore reçu');
  for (const li of lines) assert.equal(li.querySelector('.lib-row-icon'), null, 'le dessin tient lieu d’icône');
  const css = fs.readFileSync(path.join(APP, 'renderer', 'library.css'), 'utf8');
  assert.match(css, /\.lib-row-medal\.medal-locked\s*\{[^}]*grayscale\(1\)/, 'à obtenir : gris');
  assert.match(css, /\.lib-row-medal\.medal-earned\s*\{[^}]*drop-shadow/, 'reçu : un halo');
});
