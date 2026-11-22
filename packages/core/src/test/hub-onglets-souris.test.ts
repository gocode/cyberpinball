// Les onglets du haut restent accessibles à la souris, indépendamment du parcours aux boutons.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { menuRenderer } from './menu-renderer';

interface Built {
  actions: { key: string; run(): void }[];
  back(): void;
  selectHubTab(tab: string): void;
  hub: { tabs: { id: string; current: boolean; disabled?: string; action?: number }[] };
}
function screen(menuFirst: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHubScreen } = require(path.join(REPO_ROOT, 'app/dist/hub-screen.js')) as {
    createHubScreen(host: unknown, describe: (tab: string) => unknown, options: unknown): { open(back: () => void): void; current(): string };
  };
  let build: () => Built;
  let left = 0;
  const hub = createHubScreen({ library: { openCustom: (b: () => Built) => { build = b; } }, zoneKeys: () => [] }, (tab) => ({
    heading: 'Test', title: 'Test', icon: 'people', medallion: 'communaute', facts: [],
    tabs: [{ id: 'home', label: 'Accueil', icon: 'home' }, { id: 'list', label: 'Liste', icon: 'list' }, { id: 'empty', label: 'Vide', icon: 'list' }, { id: 'off', label: 'Indisponible', icon: 'list', disabled: 'Bientôt' }],
    ...(tab === 'list' ? { list: true } : {}),
    sections: tab === 'empty' ? [] : [{ title: 'Bloc', layout: 'cards', opens: 'list', cards: [
      { key: 'first', title: 'Premier', run() {} }, { key: 'second', title: 'Second', run() {} },
    ] }, { title: 'Actions', layout: 'cards', cards: [
      { key: 'third', title: 'Troisième', run() {} }, { key: 'fourth', title: 'Quatrième', run() {} },
    ] }],
  }), { menuFirst });
  hub.open(() => { left++; });
  return { hub, built: () => build(), left: () => left };
}

for (const menuFirst of [false, true]) test('clic sur les onglets depuis chaque état, menuFirst=' + menuFirst, () => {
  const h = screen(menuFirst);
  const choose = (id: string) => {
    h.built().selectHubTab(id);
    assert.equal(h.hub.current(), id);
    assert.equal(h.built().hub.tabs.find((t) => t.current)?.id, id);
    assert.equal(h.left(), 0, 'aucun Exit nécessaire');
  };
  // À l'ouverture, puis dans le contenu, un bloc ouvert, une liste et un onglet vide.
  choose('home');
  h.built().actions.find((a) => a.key === 'block:section:1')!.run();
  assert.deepEqual(h.built().actions.map((a) => a.key), ['third', 'fourth']);
  choose('list');
  choose('empty');
  choose('home');
  // Récapitulatif : le clic annule aussi le retour vers l'ancien bloc.
  h.built().actions.find((a) => a.key === 'block:section:0')!.run();
  assert.equal(h.hub.current(), 'list');
  choose('empty');
  h.built().back();
  assert.equal(h.hub.current(), 'empty');
  assert.ok(h.built().actions.every((a) => a.key.startsWith('tab:')));
  choose('list');
  h.built().selectHubTab('off');
  h.built().selectHubTab('inconnu');
  assert.equal(h.hub.current(), 'list', 'les onglets indisponibles et inconnus ne s’ouvrent pas');
});

test('rendu : chaque onglet disponible envoie son identité au clic, même sans action de flipper', () => {
  const h = screen(false);
  const clicks: { type: string; tab?: string }[] = [];
  const p = menuRenderer();
  (p.window.cyber as { act(a: unknown): void }).act = (a) => clicks.push(JSON.parse(JSON.stringify(a)) as { type: string; tab?: string });
  vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, 'app/renderer/hub.js'), 'utf8'), p.window);
  for (const desk of [false, true]) {
    p.document.documentElement.classList.toggle('menu-desktop', desk);
    p.window.hubView = h.built().hub;
    vm.runInContext("document.body.append(CyberHub.render({ hub: hubView, cursor: 0, hint: '' }))", p.window);
    const tabs = p.document.querySelectorAll('.lib-hub:last-child .hub-tab');
    assert.equal(tabs.length, 4);
    for (const [i, tab] of [...tabs].entries()) {
      assert.equal(h.built().hub.tabs[i]!.action, undefined, 'le curseur est dans le contenu');
      const event = new (p.document.defaultView as unknown as { Event: new (t: string, o: object) => object }).Event('click', { bubbles: true });
      tab.querySelector('.hub-tab-label')!.dispatchEvent(event);
      if (i < 3) assert.deepEqual(clicks.at(-1), { type: 'hub-tab', tab: ['home', 'list', 'empty'][i] });
      else assert.equal(tab.hasAttribute('data-act'), false, 'l’onglet indisponible reste inactif');
    }
    p.document.querySelector('.lib-hub:last-child')!.remove();
  }
  assert.equal(clicks.filter((a) => a.type === 'hub-tab').length, 6);
});
