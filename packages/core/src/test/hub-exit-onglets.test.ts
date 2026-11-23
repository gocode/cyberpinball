// Exit et barre d'onglets, pour tout écran à onglets (hub-screen.ts : profil, Communauté, Arène).
// Règle du mainteneur du 23/11/2026 : « Exit sort d'abord de la barre d'onglets en rendant le focus à
// l'écran courant, puis un second Exit quitte la page ». Ce test fixe l'invariant :
// - dans la barre (menu d'abord), l'onglet sous le curseur est toujours l'onglet affiché, quelle que
//   soit la touche qui le déplace (flippers, Tab, Maj+Tab) : jamais un onglet allumé sans son contenu ;
// - Exit dans la barre : le curseur sur le contenu de l'onglet affiché, la barre sans curseur ;
// - Exit au premier niveau du contenu : on quitte l'écran (jamais de boucle contenu ↔ barre) ;
// - la barre reste un arrêt des flippers, à sa place (sous l'en-tête, au-dessus du contenu) ;
// - un onglet sans contenu : Exit dans la barre quitte l'écran (rien où rendre la main).
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import { REPO_ROOT } from './i18n-scan';

setLanguage('fr');

interface Built {
  actions: { key: string; run(): void }[];
  back(): void;
  hint?: string;
  keys?(input: { code: string; shift?: boolean }): boolean;
  hub: { tabs: { id: string; current: boolean; action?: number }[] };
}

function screen(options: { menuFirst: boolean; list: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHubScreen } = require(path.join(REPO_ROOT, 'app/dist/hub-screen.js')) as {
    createHubScreen(host: unknown, describe: (tab: string) => unknown, options: unknown): { open(back: () => void, tab?: string): void; current(): string };
  };
  let build: () => Built;
  let at: number | undefined;
  let left = 0;
  const hub = createHubScreen(
    {
      library: { openCustom: (b: () => Built, i?: number) => ((build = b), (at = i)) },
      zoneKeys: () => ['MagnaLeft', 'MagnaRight'],
      navKeys: () => ({ previous: ['FlipLeft'], next: ['FlipRight'] }),
    },
    (tab) => ({
      heading: 'Essai',
      title: 'Essai',
      icon: 'people',
      medallion: 'communaute',
      facts: [],
      person: { name: 'Essai', buttons: [{ key: 'act', label: 'Agir', run() {} }] },
      tabs: [
        { id: 'a', label: 'Premier', icon: 'home' },
        { id: 'b', label: 'Second', icon: 'list' },
        { id: 'off', label: 'Indisponible', icon: 'list', disabled: 'Bientôt' },
        { id: 'empty', label: 'Vide', icon: 'list' },
      ],
      ...(options.list ? { list: true } : {}),
      sections:
        tab === 'empty'
          ? []
          : [
              { title: `Bloc ${tab}`, layout: 'cards', cards: [{ key: `${tab}1`, title: 'Un', run() {} }, { key: `${tab}2`, title: 'Deux', run() {} }] },
              { title: 'Autre', layout: 'cards', cards: [{ key: `${tab}3`, title: 'Trois', run() {} }, { key: `${tab}4`, title: 'Quatre', run() {} }] },
            ],
    }),
    { menuFirst: options.menuFirst, backNotWheel: true },
  );
  const built = () => build();
  const run = (key: string) => built().actions.find((a) => a.key === key)!.run();
  const inBar = () => built().actions.every((a) => a.key.startsWith('tab:'));
  const current = () => built().hub.tabs.find((t) => t.current)!.id;
  /** L'onglet sous le curseur (dans la barre). */
  const focusedTab = () => built().actions[at ?? 0]!.key.replace(/^tab:/, '');
  const toBar = () => {
    if (!inBar()) run('block:tabs');
    assert.ok(inBar(), 'dans la barre');
  };
  return { hub, built, run, inBar, current, focusedTab, at: () => at, left: () => left, open: (tab?: string) => hub.open(() => left++, tab), toBar };
}

for (const menuFirst of [false, true])
  for (const list of [false, true])
    test(`barre d’onglets : Exit rend la main au contenu de l’onglet affiché, puis quitte (menuFirst=${menuFirst}, liste=${list})`, () => {
      const h = screen({ menuFirst, list });
      h.open();
      h.toBar();
      assert.equal(h.focusedTab(), h.current(), 'à l’entrée dans la barre : le curseur sur l’onglet ouvert');
      if (menuFirst) {
        // Toutes les touches qui déplacent dans la barre montrent l'onglet tout de suite (l'indisponible sauté).
        for (const [input, want] of [[{ code: 'FlipRight' }, 'b'], [{ code: 'Tab' }, 'empty'], [{ code: 'Tab', shift: true }, 'b'], [{ code: 'FlipRight' }, 'empty'], [{ code: 'FlipLeft' }, 'b']] as const) {
          assert.ok(h.built().keys!(input), `${input.code} pris par la barre`);
          assert.equal(h.current(), want, `${JSON.stringify(input)} : l’onglet affiché`);
          assert.equal(h.focusedTab(), h.current(), `${JSON.stringify(input)} : l’onglet sous le curseur est l’onglet affiché`);
          assert.ok(h.inBar(), 'le curseur reste dans la barre');
        }
      } else h.run('tab:b');
      if (!menuFirst) h.toBar();
      const shown = h.current();
      // Exit dans la barre : le contenu de l'onglet affiché ; la barre sans curseur.
      h.built().back();
      assert.equal(h.left(), 0, 'le premier Exit ne quitte pas');
      assert.equal(h.current(), shown, 'l’onglet affiché ne change pas');
      assert.ok(!h.inBar(), 'sorti de la barre');
      assert.ok(h.built().hub.tabs.every((t) => t.action === undefined), 'aucun onglet sous le curseur');
      const keys = h.built().actions.map((a) => a.key);
      const bar = keys.indexOf('block:tabs');
      assert.ok(bar > 0 && keys.slice(0, bar).every((k) => k.startsWith('block:person:')), `la barre, à sa place, est un arrêt : ${keys.join(', ')}`);
      assert.equal(h.at(), bar + 1, 'le curseur sur le premier élément du contenu');
      // Exit au premier niveau du contenu : on quitte l'écran, sans repasser par la barre.
      assert.match(h.built().hint ?? '', /Exit : retour$/);
      h.built().back();
      assert.equal(h.left(), 1, 'le second Exit quitte');
    });

for (const menuFirst of [false, true])
  test(`barre d’onglets : un onglet sans contenu, Exit quitte d’un appui (menuFirst=${menuFirst})`, () => {
    const h = screen({ menuFirst, list: true });
    h.open('empty');
    h.toBar();
    assert.equal(h.current(), 'empty');
    h.built().back();
    assert.equal(h.left(), 1);
  });
