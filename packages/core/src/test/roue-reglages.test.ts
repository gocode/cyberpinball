// Menu système > Tables > Roue (demande du 12/11/2026) : tous les réglages de la roue dans un
// même écran (app/src/wheel-settings.ts), et le réglage « Logos animés » : seul le logo de la
// table choisie s'anime (défaut), ou tous. Rendu : app/renderer/frontend.js (attachStill),
// frontend.css (.wheel-still), media.js (CyberMedia.stillLogo).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { DEFAULT_MENU_MEDIA_SETTINGS, normalizeMenuMediaSettings, WHEEL_MOTIONS, type MenuMediaSettings } from '../mediaview';
import { SYSTEM_GROUPS, systemPathOf } from '../systemmenu';
import { menuRenderer, menuState } from './menu-renderer';

const S = DEFAULT_MENU_MEDIA_SETTINGS;

interface BuiltLike {
  heading: string;
  icon?: string;
  actions: { label: string; detail?: string; icon?: string; run: () => void }[];
  back: () => void;
}

test('logos animés : seulement la table choisie par défaut, « tous » gardé, une valeur inconnue revient au défaut', () => {
  assert.deepEqual(WHEEL_MOTIONS, ['selected', 'all']);
  assert.equal(S.wheelMotion, 'selected');
  assert.equal(normalizeMenuMediaSettings({}).wheelMotion, 'selected', 'une borne d’avant ce réglage fige les voisins');
  assert.equal(normalizeMenuMediaSettings({ wheelMotion: 'all' }).wheelMotion, 'all');
  assert.equal(normalizeMenuMediaSettings({ wheelMotion: 'jamais' }).wheelMotion, 'selected');
});

test('menu système : « Roue » est dans Tables, à côté des Collections', () => {
  assert.deepEqual(systemPathOf('wheel'), ['tables']);
  const entries = SYSTEM_GROUPS.tables.entries as readonly string[];
  assert.equal(entries.indexOf('wheel'), entries.indexOf('collections') + 1);
});

const WHEEL_ROWS = ['menuLayout', 'tableOrder', 'startTable', 'wheelStart', 'wheelMotion', 'tableColor', 'jukebox', 'community', 'collectionsMedallion'];

test('écran Roue : tous les réglages de la roue, et eux seuls ; plus aucun dans « Médias, son et attente »', () => {
  const { WHEEL_SETTINGS_ROWS } = require(path.join(REPO_ROOT, 'app', 'dist', 'wheel-settings.js')) as { WHEEL_SETTINGS_ROWS: readonly string[] };
  const { MENU_SETTINGS_ROWS } = require(path.join(REPO_ROOT, 'app', 'dist', 'menu-settings.js')) as { MENU_SETTINGS_ROWS: readonly string[] };
  assert.deepEqual([...WHEEL_SETTINGS_ROWS], WHEEL_ROWS);
  for (const key of WHEEL_ROWS) assert.ok(!MENU_SETTINGS_ROWS.includes(key), `${key} : réglage de la roue resté dans « Médias, son et attente »`);
  // Le code de l'ancien écran ne garde ni la liste des présentations ni celle des ordres.
  const media = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'menu-settings.ts'), 'utf8');
  assert.doesNotMatch(media, /openLayout|openTableOrder|wheelStart|tableColor/);
});

test('écran Roue : chaque sous-écran revient sur sa ligne ; Start bascule les logos animés', () => {
  const { createWheelSettings, WHEEL_SETTINGS_ROWS } = require(path.join(REPO_ROOT, 'app', 'dist', 'wheel-settings.js')) as {
    createWheelSettings(host: unknown): { run(): void; detail?: string };
    WHEEL_SETTINGS_ROWS: readonly string[];
  };
  let settings: MenuMediaSettings = { ...S };
  const opened: { build: () => BuiltLike; at: number }[] = [];
  const item = createWheelSettings({
    library: { openCustom: (build: () => BuiltLike, at = 0) => opened.push({ build, at }), openSystem() {} },
    settings: () => settings,
    save: (next: MenuMediaSettings) => (settings = next),
  });
  assert.match(item.detail ?? '', /logos animés : seulement la table choisie/);
  item.run();
  const main = opened[0]!.build;
  assert.equal(main().heading, 'Roue');
  assert.equal(main().icon, 'wheel');
  assert.equal(main().actions.length, WHEEL_SETTINGS_ROWS.length + 1, 'une ligne par réglage, plus Retour');
  const icons = main().actions.slice(0, -1).map((a) => a.icon);
  assert.equal(new Set(icons).size, icons.length, icons.join(', '));

  for (let i = 0; i < WHEEL_SETTINGS_ROWS.length; i++) {
    const before = opened.length;
    const snapshot = settings;
    main().actions[i]!.run();
    if (opened.length === before) {
      assert.notDeepEqual(settings, snapshot, `${WHEEL_SETTINGS_ROWS[i]} : Start change le réglage sur place`);
      settings = snapshot;
      continue;
    }
    opened.at(-1)!.build().back();
    assert.equal(opened.at(-1)!.at, i, `${WHEEL_SETTINGS_ROWS[i]} : Exit revient sur sa ligne`);
    opened.at(-2)!.build().actions[0]!.run();
    assert.equal(opened.at(-1)!.at, i, `${WHEEL_SETTINGS_ROWS[i]} : un choix revient sur sa ligne`);
    settings = snapshot;
  }

  const motion = () => main().actions[WHEEL_SETTINGS_ROWS.indexOf('wheelMotion')]!;
  assert.match(motion().label, /Logos animés : seulement la table choisie/);
  motion().run();
  assert.equal(settings.wheelMotion, 'all');
  assert.match(motion().label, /Logos animés : tous/);
  motion().run();
  assert.equal(settings.wheelMotion, 'selected');
});

/** Laisse passer les promesses de CyberMedia.still et la pose de l'image fixe. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

test('rendu : hors du centre, un logo animé reçoit sa première image ; au réglage « tous », rien n’est figé', async () => {
  const { document, send, window } = menuRenderer();
  const asked: string[] = [];
  // A.png et C.png sont animés, B.png (au centre) aussi ; D.png est fixe : pas d'image fixe pour lui.
  (window.CyberMedia as { stillLogo: (url: string, className: string) => Promise<unknown> }).stillLogo = (url: string, className: string) => {
    asked.push(url);
    if (url.endsWith('D.png')) return Promise.resolve(null);
    const img = document.createElement('img');
    img.className = className;
    img.setAttribute('src', `blob:fixe-${path.basename(url)}`);
    return Promise.resolve(img);
  };
  const state = menuState({ 'A.vpx': 'media://A.png', 'B.vpx': 'media://B.png', 'C.vpx': 'media://C.png', 'D.vpx': 'media://D.png' });
  send(state);
  await settle();
  const stage = document.querySelector('.wheel-stage')!;
  assert.ok(stage.classList.contains('logos-fixes'), 'par défaut : seulement la table choisie');
  const items = [...document.querySelectorAll('.wheel-item')];
  const still = (title: string) => {
    const node = items.find((n) => n.querySelector('img.wheel-img')?.getAttribute('src')?.includes(title));
    return node?.querySelector('.wheel-tilt > .wheel-still') ?? null;
  };
  // Le logo animé reste le premier : l'anneau du centre et le relevé des essais le mesurent.
  for (const n of items) assert.ok(!n.querySelector('.wheel-tilt')!.firstElementChild!.classList.contains('wheel-still'));
  assert.equal(still('A.png')?.getAttribute('src'), 'blob:fixe-A.png');
  assert.ok(still('B.png'), 'le centre la reçoit aussi : la feuille de style la cache au centre');
  assert.equal(still('D.png'), null, 'logo fixe : rien à poser');
  // Un nouvel état ne repose pas une image déjà là.
  const count = asked.length;
  send(state);
  await settle();
  // Trois médaillons (le halo, copie du centre, en porte une copie, cachée).
  assert.equal(document.querySelectorAll('.wheel-item .wheel-still').length, 3);
  assert.equal(asked.length, count, 'aucune nouvelle demande pour des logos déjà figés');

  send({ ...state, wheelMotion: 'all' });
  assert.ok(!stage.classList.contains('logos-fixes'), '« tous » : chaque logo s’anime');
});

test('rendu : au réglage « tous », aucune première image n’est calculée', async () => {
  const { document, send, window } = menuRenderer();
  let asked = 0;
  (window.CyberMedia as { stillLogo: () => Promise<unknown> }).stillLogo = () => {
    asked++;
    return Promise.resolve(document.createElement('img'));
  };
  send({ ...menuState({ 'A.vpx': 'media://A.png', 'B.vpx': 'media://B.png', 'C.vpx': 'media://C.png' }), wheelMotion: 'all' });
  await settle();
  assert.equal(asked, 0);
  assert.equal(document.querySelectorAll('.wheel-still').length, 0);
});

test('feuille de style : hors du centre, la première image remplace le logo animé, jamais une place vide', () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.css'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(css, /\.wheel-still \{\n  display: none;\n\}/, 'cachée par défaut (au centre, dans le halo, réglage « tous »)');
  // Le logo animé n'est retiré que si la première image est là (:has), et seulement hors du centre.
  assert.match(css, /\.wheel-stage\.logos-fixes \.wheel-item:not\(\.center\) \.wheel-tilt:has\(> \.wheel-still\) > \.wheel-img:not\(\.wheel-still\) \{\n  display: none;/);
  assert.match(css, /\.wheel-stage\.logos-fixes \.wheel-item:not\(\.center\) \.wheel-tilt > \.wheel-still \{\n  display: block;/);
  assert.match(css, /\.wheel-tilt > \.wheel-img \{\n  grid-area: 1 \/ 1;/, 'les deux images l’une sur l’autre, dans la même case');
});
