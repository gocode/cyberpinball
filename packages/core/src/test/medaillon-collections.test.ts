// Médaillon Collections de la roue (demande du 13/11/2026), comme ceux du Juke-box et de la
// Communauté : le dernier des médaillons de tête, le plus près des tables ; Start ouvre la liste des
// collections (la même que Menu système › Collections) ; Start sur une collection l'affiche sur la
// roue, sur sa table ; Exit revient au médaillon. Son affiche : la collection montrée et les autres.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { DEFAULT_MENU_MEDIA_SETTINGS, normalizeMenuMediaSettings } from '../mediaview';
import { medallionWheel, medallionWheelMove, type Medallion } from '../jukebox-screens';

const LEADS: Medallion[] = ['jukebox', 'community', 'collections'];

test('roue : Collections est le dernier médaillon de tête, voisin de la première table', () => {
  const on = medallionWheel({ tables: 5, at: 2, leads: LEADS, selected: 'collections' });
  assert.equal(on.count, 8);
  assert.equal(on.position, 3, '« 3 / 8 » : Juke-box, Communauté, Collections');
  assert.deepEqual(on.places.find((p) => p.offset === 0), { offset: 0, medallion: 'collections' });
  assert.deepEqual(on.places.find((p) => p.offset === 1), { offset: 1, table: 0 });
  assert.deepEqual(medallionWheelMove({ tables: 5, at: 0, leads: LEADS, selected: 'collections' }, 1), { table: 0 });
  assert.deepEqual(medallionWheelMove({ tables: 5, at: 0, leads: LEADS }, -1), { medallion: 'collections' });
  assert.deepEqual(medallionWheelMove({ tables: 5, at: 0, leads: LEADS, selected: 'collections' }, -1), { medallion: 'community' });
});

test('réglage « Collections dans la roue » : affiché par défaut, gardé quand on le masque', () => {
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.collectionsMedallion, true);
  assert.equal(normalizeMenuMediaSettings({}).collectionsMedallion, true, 'une borne d’avant ce réglage voit le médaillon');
  assert.equal(normalizeMenuMediaSettings({ collectionsMedallion: false }).collectionsMedallion, false);
});

interface Built {
  heading: string;
  lead?: string;
  sections: { title?: string; rows: { text: string; detail?: string; tone?: string; action?: number }[] }[];
  actions: { label: string; run: () => void }[];
  back: () => void;
}

type Item = { run(): void; openFromWheel(back: () => void, shown: () => void): void };

function fakeCollections() {
  const list = [
    { id: 'all', group: 'main', label: 'Toutes', icon: 'list', tables: [1, 2, 3, 4] },
    { id: 'favorites', group: 'main', label: 'Favoris', icon: 'star', tables: [2] },
    { id: 'never', group: 'main', label: 'Jamais jouées', icon: 'list', tables: [], reason: 'Toutes vos tables ont déjà été jouées' },
    { id: 'maker:bally', group: 'maker', label: 'Bally', icon: 'list', tables: [1, 3] },
  ];
  let active = 'all';
  const chosen: string[] = [];
  return {
    chosen,
    menu: {
      list: () => list,
      current: () => list.find((c) => c.id === active)!,
      choose: (id: string) => {
        chosen.push(id);
        const changed = id !== active;
        active = id;
        return changed;
      },
      mine: () => [],
    },
  };
}

function harness() {
  const { createCollectionsItem } = require(path.join(REPO_ROOT, 'app', 'dist', 'collections-menu.js')) as { createCollectionsItem(host: unknown): Item };
  const c = fakeCollections();
  const screens: { build: () => Built; at?: number }[] = [];
  const events: string[] = [];
  const item = createCollectionsItem({
    collections: c.menu,
    library: {
      openCustom: (build: () => Built, at?: number) => screens.push({ build, at }),
      openSystem: () => events.push('menu système'),
      leave: () => events.push('roue'),
      openPrompt() {},
    },
    keysLabel: () => 'MagnaSave gauche / droit',
    captureKeys() {},
  });
  const last = () => screens[screens.length - 1]!.build();
  const pick = (label: string) => last().actions.find((a) => a.label === label)!.run();
  return { item, c, screens, events, last, pick };
}

test('Start sur le médaillon : la liste des collections ; Start sur l’une l’affiche sur la roue, Exit revient au médaillon', () => {
  const h = harness();
  h.item.openFromWheel(
    () => h.events.push('médaillon'),
    () => h.events.push('collection affichée'),
  );
  const built = h.last();
  assert.equal(built.heading, 'Collections');
  assert.match(built.lead ?? '', /Exit revient au médaillon/);
  assert.equal(h.screens[0]!.at, 0, 'le curseur sur la collection montrée');
  assert.deepEqual(
    built.sections.flatMap((s) => s.rows.map((r) => r.text)),
    ['Toutes', 'Favoris', 'Jamais jouées', 'Bally'],
    'toutes les collections, vides comprises (grisées)',
  );
  assert.equal(built.sections.flatMap((s) => s.rows).find((r) => r.text === 'Jamais jouées')!.tone, 'quiet');
  // Une collection vide : rien.
  h.pick('Jamais jouées');
  assert.deepEqual(h.c.chosen, []);
  assert.deepEqual(h.events, []);
  // Bally : choisie, et la roue l'affiche (pas le menu système).
  h.pick('Bally');
  assert.deepEqual(h.c.chosen, ['maker:bally']);
  assert.deepEqual(h.events, ['collection affichée']);
  // La collection déjà montrée : la roue l'affiche aussi (on quitte le médaillon pour ses tables).
  h.item.openFromWheel(
    () => h.events.push('médaillon'),
    () => h.events.push('collection affichée'),
  );
  h.pick('Bally');
  assert.deepEqual(h.events, ['collection affichée', 'collection affichée']);
  // Exit (Retour) : le médaillon.
  h.item.openFromWheel(
    () => h.events.push('médaillon'),
    () => h.events.push('collection affichée'),
  );
  h.last().back();
  assert.equal(h.events.at(-1), 'médaillon');
});

test('Menu système › Collections reste ce qu’il était : retour au menu système, choix vers la roue', () => {
  const h = harness();
  h.item.openFromWheel(
    () => h.events.push('médaillon'),
    () => h.events.push('collection affichée'),
  );
  // Ouvert ensuite depuis le menu système : plus rien du médaillon.
  h.item.run();
  assert.doesNotMatch(h.last().lead ?? '', /médaillon/);
  h.last().back();
  assert.deepEqual(h.events, ['menu système']);
  h.item.run();
  h.pick('Favoris');
  assert.deepEqual(h.events, ['menu système', 'roue']);
});

test('affiche du médaillon : nombre de collections et de tables, la collection montrée, quelques autres', () => {
  const { collectionsPoster } = require(path.join(REPO_ROOT, 'app', 'dist', 'collections-menu.js')) as { collectionsPoster(c: unknown): Record<string, unknown> };
  const c = fakeCollections();
  c.menu.choose('favorites');
  const p = collectionsPoster(c.menu);
  assert.equal(p.title, 'COLLECTIONS');
  assert.equal(p.stats, '3 collections · 4 tables', 'les collections vides ne comptent pas');
  assert.equal(p.heading, 'Favoris · 1 table');
  assert.equal(p.detail, 'Aussi : Toutes, Bally');
  assert.equal(p.open, 'Choisir une collection');
});

test('frontend : le médaillon est câblé comme les deux autres (roue, Start, clic, téléphone, affiche, rendu)', () => {
  const main = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(main, /collectionsShown\(\) \? \(\['collections'\] as const\)/, 'dans les médaillons de tête, après la Communauté');
  assert.match(main, /button === 'confirm' && onCollections\(\)/, 'Start ouvre la liste');
  assert.match(main, /action\.offset === 0 && onCollections\(\)/, 'clic au centre de la roue');
  assert.match(main, /leads\.includes\('collections'\)/, 'au téléphone');
  assert.match(main, /collectionsMedallion: state\.phase === 'menu'/, 'son affiche');
  const renderer = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.js'), 'utf8');
  assert.match(renderer, /n\.collectionsMedallion/);
  assert.match(renderer, /CyberCollections\.wheelPoster/);
  assert.match(renderer, /CyberCollections\?\.zone/);
  for (const f of ['collections.png', 'collections-512.webp']) assert.ok(fs.existsSync(path.join(REPO_ROOT, 'app', 'renderer', 'medaillons', f)), `${f} généré (medaillons.cjs)`);
});
