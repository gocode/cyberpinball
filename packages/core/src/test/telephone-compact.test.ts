// Télécommande compacte : barre du bas en icônes seules, bascule Pavé ↔ Miroir en bouton-icône, mode immersif.
// La page est lue dans ses fichiers, et ses scripts exécutés avec un faux DOM (node:vm), comme telephone-miroir.test.ts.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as vm from 'node:vm';
import { REPO_ROOT } from './i18n-scan';

const DIR = path.join(REPO_ROOT, 'app', 'renderer', 'telephone');
const read = (name: string) => fs.readFileSync(path.join(DIR, name), 'utf8');
const html = read('telephone.html');
const css = read('telephone.css');

interface FakeElement {
  attrs: Record<string, string>;
  title: string;
  listeners: Record<string, Array<() => void>>;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, fn: () => void): void;
  replaceChildren(...nodes: unknown[]): void;
  click(): void;
}

function fakeElement(): FakeElement {
  const el: FakeElement = {
    attrs: {},
    title: '',
    listeners: {},
    setAttribute: (n, v) => void (el.attrs[n] = v),
    addEventListener: (type, fn) => void (el.listeners[type] ??= []).push(fn),
    replaceChildren: () => undefined,
    click: () => el.listeners.click?.forEach((fn) => fn()),
  };
  return el;
}

test('barre du bas : des icônes seules, le libellé reste en infobulle et pour les lecteurs d\'écran', () => {
  // Chaque outil porte son infobulle (telephone.js) ; le libellé et la raison ne sont plus montrés (rognés à 1 px).
  assert.match(read('telephone.js'), /b\.title = span\.textContent;/);
  assert.match(css, /\.tool-label,\s*\.tool-reason \{\s*position: absolute;\s*width: 1px;\s*height: 1px;[^}]*clip: rect\(0 0 0 0\);/);
  // Des cibles tactiles d'au moins 44 px.
  const heights = [...css.matchAll(/\.tool \{[^}]*?min-height: (\d+)px;/g)].map((m) => Number(m[1]));
  assert.ok(heights.length > 0 && heights.every((h) => h >= 44), `cibles de la barre : ${heights.join(', ')} px`);
  const sizes = [...css.matchAll(/\.top-volume,\s*body\[data-mode='browser'\]\[data-state='paired'\] \.top-immersive \{\s*width: (\d+)px;\s*height: (\d+)px;/g)];
  assert.equal(sizes.length, 1);
  assert.ok(Number(sizes[0]?.[1]) >= 44 && Number(sizes[0]?.[2]) >= 44);
});

test('barre du bas : les boutons Pavé et Miroir sont dans la barre, cachés tant que la fenêtre ne se capture pas, celui du mode montré est vert', () => {
  const tools = html.slice(html.indexOf('<nav class="tools"'), html.indexOf('</nav>', html.indexOf('<nav class="tools"')));
  assert.ok(tools.includes('id="nav-mirror"'));
  assert.ok(tools.indexOf('id="nav-forward"') < tools.indexOf('id="nav-mirror"') && tools.indexOf('id="nav-mirror"') < tools.indexOf('id="nav-keyboard"'));
  assert.match(css, /body:not\(\[data-miroir='on'\]\):not\(\[data-miroir='off'\]\) #nav-mirror,/);
  assert.match(css, /\.tool\[aria-pressed='true'\] \{[^}]*var\(--signal\)/);
  // Autant de colonnes que de boutons visibles (cinq sans miroir, sept avec).
  assert.match(css, /\.tools \{\s*display: grid;\s*grid-auto-flow: column;\s*grid-auto-columns: minmax\(0, 1fr\);/);
});

test('boutons Pavé et Miroir : chacun choisit son mode, et l\'état enfoncé suit le choix', () => {
  const toggle = fakeElement();
  const pad = fakeElement();
  const elements: Record<string, unknown> = { mirror: { getBoundingClientRect: () => ({ width: 400, height: 800 }), addEventListener: () => undefined, classList: { add: () => undefined, remove: () => undefined, toggle: () => undefined } }, 'mirror-canvas': { getContext: () => ({ clearRect: () => undefined, setTransform: () => undefined }), addEventListener: () => undefined }, 'nav-mirror': toggle, 'nav-pad': pad };
  const sent: Array<Record<string, unknown>> = [];
  const store: Record<string, string> = {};
  const context = vm.createContext({
    document: { getElementById: (id: string) => elements[id], createElement: () => ({}), addEventListener: () => undefined, hidden: false, body: { dataset: {} } },
    window: { devicePixelRatio: 1, addEventListener: () => undefined },
    sessionStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] },
    screen: {},
    navigator: {},
    t: (s: string) => s,
    cyberIcon: () => ({}),
    Math,
    clearTimeout,
    setTimeout,
    mode: 'browser',
    state: 'paired',
    send: (m: Record<string, unknown>) => (sent.push(m), true),
  });
  vm.runInContext(read('telephone-miroir.js'), context);
  assert.equal(toggle.title, 'Miroir', 'infobulle');
  assert.equal(pad.title, 'Pavé tactile', 'infobulle');
  vm.runInContext('mirror.available = true; mirrorRefresh();', context);
  assert.equal(toggle.attrs['aria-pressed'], 'false');
  assert.equal(pad.attrs['aria-pressed'], 'true', 'le pavé est le mode montré au départ');
  assert.equal(vm.runInContext('document.body.dataset.miroir', context), 'off');
  assert.equal(sent.length, 0, 'aucune demande tant que le miroir n\'est pas choisi');

  toggle.click();
  assert.equal(toggle.attrs['aria-pressed'], 'true');
  assert.equal(pad.attrs['aria-pressed'], 'false');
  assert.equal(vm.runInContext('document.body.dataset.miroir', context), 'on');
  assert.ok(sent.some((m) => m.t === 'mirror' && m.on === true), 'la borne est priée de capturer');
  assert.equal(store['cyberpinball.miroir'], 'on', 'choix retenu pour la session');

  toggle.click();
  assert.equal(vm.runInContext('document.body.dataset.miroir', context), 'on', 'un second appui sur Miroir ne fait pas revenir au pavé');
  pad.click();
  assert.equal(toggle.attrs['aria-pressed'], 'false');
  assert.equal(pad.attrs['aria-pressed'], 'true');
  assert.equal(vm.runInContext('document.body.dataset.miroir', context), 'off');
  assert.ok(sent.some((m) => m.t === 'mirror' && m.on === false), 'retour au pavé : la borne s\'arrête');
});

test('en-tête et marges : réduits au navigateur, zones sûres respectées, miroir sans bordure qui fausserait les appuis', () => {
  const compact = css.slice(css.indexOf('Au navigateur, liaison acceptée'));
  assert.match(compact, /body\[data-mode='browser'\]\[data-state='paired'\] \{\s*padding: max\(4px, env\(safe-area-inset-top\)\) max\(6px, env\(safe-area-inset-right\)\) max\(6px, env\(safe-area-inset-bottom\)\) max\(6px, env\(safe-area-inset-left\)\);/);
  assert.match(compact, /\.top \{\s*min-height: 44px;/);
  // Les zones sûres latérales valent aussi pour toutes les pages (téléphone en paysage, encoche).
  assert.match(css, /body \{[^}]*max\(14px, env\(safe-area-inset-right\)\)[^}]*max\(14px, env\(safe-area-inset-left\)\)/);
  assert.match(css, /body\[data-miroir='on'\] \.mirror \{[^}]*border: 0;/);
});

test('mode immersif : limité au navigateur une fois la liaison acceptée, avec une poignée pour revenir', () => {
  assert.match(css, /body\.immersive\[data-mode='browser'\]\[data-state='paired'\] \.top,\s*body\.immersive\[data-mode='browser'\]\[data-state='paired'\] \.volume,\s*body\.immersive\[data-mode='browser'\]\[data-state='paired'\] \.tools \{\s*display: none;/);
  assert.match(css, /body\.immersive\[data-mode='browser'\]\[data-state='paired'\] \.immersive-handle \{\s*display: block;/);
  assert.match(html, /id="top-immersive"/);
  assert.match(html, /id="immersive-handle"/);
  const at = (name: string) => html.indexOf('<script src="' + name + '"></script>');
  assert.ok(at('telephone-miroir.js') >= 0 && at('telephone-immersif.js') > at('telephone-miroir.js') && at('telephone-immersif.js') < at('telephone.js'));
  assert.ok(fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'phone-remote.ts'), 'utf8').includes("'/telephone-immersif.js': 'telephone/telephone-immersif.js'"));
});

test('mode immersif : le bouton masque et la poignée ramène ; hors navigateur ou liaison perdue, les barres reviennent', () => {
  const button = fakeElement();
  const handle = fakeElement();
  const classes = new Set<string>();
  let observed: (() => void) | undefined;
  const body = {
    dataset: { mode: 'browser', state: 'paired' } as Record<string, string>,
    classList: { contains: (c: string) => classes.has(c), toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)) },
  };
  const elements: Record<string, unknown> = { 'top-immersive': button, 'immersive-handle': handle };
  const context = vm.createContext({
    document: { getElementById: (id: string) => elements[id], body },
    t: (s: string) => s,
    cyberIcon: () => ({}),
    MutationObserver: class {
      constructor(fn: () => void) {
        observed = fn;
      }
      observe() {}
    },
  });
  vm.runInContext(read('telephone-immersif.js'), context);
  assert.equal(button.attrs['aria-label'], 'Masquer les barres');
  assert.equal(handle.attrs['aria-label'], 'Afficher les barres');
  assert.equal(button.attrs['aria-pressed'], undefined, 'rien d\'enfoncé au départ (l\'attribut du HTML vaut false)');

  button.click();
  assert.ok(classes.has('immersive'));
  assert.equal(button.attrs['aria-pressed'], 'true');
  handle.click();
  assert.equal(classes.has('immersive'), false);
  assert.equal(button.attrs['aria-pressed'], 'false');

  button.click();
  body.dataset.state = 'lost';
  observed?.();
  assert.equal(classes.has('immersive'), false, 'liaison perdue : les barres reviennent');
  body.dataset.state = 'paired';
  button.click();
  body.dataset.mode = 'menu';
  observed?.();
  assert.equal(classes.has('immersive'), false, 'hors navigateur : les barres reviennent');
});
