import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { menuRenderer } from './menu-renderer';

// Listes qui défilent des écrans de gestion (.lib-actions, .lib-content, app/renderer/library.css).
// Octobre 2026, revue de Codex du menu système : le fondu (mask-image) posé au bord d'une liste
// qui défile faisait passer la dernière ligne visible pour désactivée (« Écrans et rôles »,
// « Touches par défaut des encodeurs ») ; et une liste courte, centrée en hauteur au bureau,
// commençait à une hauteur différente d'un écran à l'autre. Le garde-fou de mise en page
// (app/src/layout-check.ts) relève les mêmes défauts dans le rendu réel ; ce test les arrête
// avant tout rendu.
const RENDERER = path.join(__dirname, '..', '..', '..', '..', 'app', 'renderer');

type Rule = { file: string; selector: string; body: string };

function rules(): Rule[] {
  const out: Rule[] = [];
  for (const file of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(RENDERER, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ file, selector: selector!.trim(), body: body! });
  }
  return out;
}

/** Classes du dernier élément de chaque sélecteur de la règle (celui que la règle habille). */
function targets(selector: string): string[] {
  return selector.split(',').flatMap((s) => [...(s.trim().split(/[\s>+~]+/).pop() ?? '').matchAll(/\.([\w-]+)/g)].map((m) => m[1]!));
}

test('aucune liste qui défile ne s’efface en fondu (mask-image)', () => {
  const all = rules();
  // Classes des listes qui défilent : les deux conteneurs communs, et toute classe qui défile.
  const scrolling = new Set(['lib-actions', 'lib-content']);
  for (const r of all) if (/(?:^|;)\s*overflow(?:-y)?:\s*(?:auto|scroll)\b/m.test(r.body)) for (const c of targets(r.selector)) scrolling.add(c);
  const offenders = all
    .filter((r) => /mask-image\s*:(?!\s*none\b)/.test(r.body) && targets(r.selector).some((c) => scrolling.has(c)))
    .map((r) => `${r.file} ${r.selector.replace(/\s+/g, ' ')}`);
  assert.deepEqual(offenders, [], 'un fondu fait passer la ligne du bord pour désactivée : un filet (.more-above / .more-below, couleur de bordure) l’indique');
});

test('le bord derrière lequel il reste des entrées porte un filet', () => {
  const all = rules();
  for (const side of ['above', 'below'] as const) {
    const prop = side === 'above' ? 'border-top-color' : 'border-bottom-color';
    const rule = all.find((r) => r.file === 'library.css' && r.selector.split(',').some((s) => s.trim() === `.lib-actions.more-${side}`));
    assert.ok(rule, `.lib-actions.more-${side} absent de library.css`);
    assert.match(rule.body, new RegExp(`${prop}\\s*:\\s*var\\(--line-strong\\)`), `.lib-actions.more-${side} : ${prop} attendu`);
  }
  const base = all.find((r) => r.file === 'library.css' && r.selector.split(',').some((s) => s.trim() === '.lib-actions') && /border-block\s*:/.test(r.body));
  assert.ok(base, 'bords de .lib-actions toujours posés (transparents au repos) : rien ne bouge quand un filet s’allume');
});

test('une liste seule part juste sous l’en-tête, jamais centrée en hauteur', () => {
  const offenders = rules()
    .filter((r) => r.file === 'library.css' && /\.only-actions\b/.test(r.selector) && /align-(?:content|items|self)\s*:\s*(?:center|space-\w+|end)/.test(r.body))
    .map((r) => r.selector.replace(/\s+/g, ' '));
  assert.deepEqual(offenders, [], 'centrée en hauteur, une liste courte commence à une hauteur différente d’un écran à l’autre');
  const list = rules().find((r) => r.file === 'library.css' && r.selector.replace(/\s+/g, ' ') === '.lib-body.only-actions > .lib-actions');
  assert.ok(list && /align-self\s*:\s*start/.test(list.body), 'la liste seule doit être posée en haut de sa rangée (align-self: start)');
});

// ---------- Défilement gardé d'un rendu à l'autre (app/renderer/scroll-keeper.js) ----------
// Octobre 2026, « Chargement : propositions » de The Matrix : pendant un téléchargement, chaque
// tic de progression redessinait la liste puis y ramenait l'élément choisi (scrollIntoView).
// Impossible de parcourir les autres propositions à la molette. L'invariant : une mise à jour
// sans geste de l'utilisateur ne change jamais le défilement ; seul un changement de choix
// (flippers, Tab, clic) ou d'écran ramène l'élément choisi dans la vue.

/** Faux défilement : linkedom ne met rien en page ; on note qui est ramené dans la vue. */
type Doc = ReturnType<typeof parseHTML>['document'];
type Node = ReturnType<Doc['createElement']>;

function watchReveals(document: Doc): Node[] {
  const revealed: Node[] = [];
  let proto = Object.getPrototypeOf(document.createElement('li'));
  while (proto && proto.constructor.name !== 'Element') proto = Object.getPrototypeOf(proto);
  proto.scrollIntoView = function (this: Node) {
    revealed.push(this);
  };
  return revealed;
}

/** Écran de propositions de médias : six cartes, l'une en téléchargement (`progress`). */
function proposals(cursor: number, progress: number, heading = 'Chargement : propositions') {
  const cards = [0, 1, 2, 3, 4, 5].map((i) => ({
    action: i,
    title: `Proposition ${i}`,
    thumb: { kind: 'image', rotation: 0, text: '' },
    ...(i === 5 ? { progress, pending: `Attente du site · ${Math.round(30 - progress * 30)} s` } : {}),
  }));
  return {
    role: 'playfield',
    phase: 'library',
    help: false,
    count: 1,
    position: 1,
    neighbors: [],
    footer: [],
    gameKeys: [],
    menuKeys: [],
    nav: {},
    library: {
      screen: 'custom',
      heading,
      subheading: 'The Matrix',
      back: 'Retour',
      hint: '',
      sections: [],
      cursor,
      media: { cards },
      actions: [...cards.map((c) => ({ label: c.title })), { label: 'Arrêter la file' }, { label: 'Retour' }],
    },
  };
}

test('menu : un tic de progression ne fait pas défiler la liste, un geste si', () => {
  const { document, send } = menuRenderer();
  const revealed = watchReveals(document);
  const content = () => document.querySelector('.lib-content') as unknown as { scrollTop: number };

  send(proposals(5, 0.1));
  assert.equal(revealed.length, 1, 'un écran qui s’ouvre montre l’élément choisi');
  // L'utilisateur fait défiler la liste à la molette, loin de la carte qui télécharge.
  content().scrollTop = 40;
  revealed.length = 0;
  for (const progress of [0.2, 0.5, 0.9]) {
    send(proposals(5, progress));
    assert.equal(content().scrollTop, 40, `progression ${progress} : la liste reste où l’utilisateur l’a mise`);
    assert.deepEqual(revealed, [], `progression ${progress} : rien n’est ramené dans la vue sans geste`);
  }

  // Flipper : le choix change, la nouvelle carte est ramenée dans la vue.
  send(proposals(4, 0.95));
  assert.equal(revealed.length, 1);
  assert.equal(revealed[0]!.querySelector('.media-title')!.textContent, 'Proposition 4');

  // Un autre écran repart du haut.
  content().scrollTop = 80;
  revealed.length = 0;
  send(proposals(4, 0.95, 'Afficheur large : propositions'));
  assert.ok(!content().scrollTop, 'un autre écran ne reprend pas le défilement du précédent');
  assert.equal(revealed.length, 1);
});

test('réglages de VPX : une mise à jour garde la liste et le détail où ils sont', () => {
  const html = fs.readFileSync(path.join(RENDERER, 'settings.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
  const { window, document } = parseHTML(html);
  let onState: ((s: unknown) => void) | undefined;
  const ctx: Record<string, unknown> = {
    document,
    location: { search: '' },
    URLSearchParams,
    console,
    HTMLElement: window.HTMLElement,
    cyberSettings: { onState: (f: (s: unknown) => void) => (onState = f), ready() {}, act() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const scripts = [...fs.readFileSync(path.join(RENDERER, 'settings.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]!);
  for (const name of scripts) vm.runInContext(fs.readFileSync(path.join(RENDERER, name), 'utf8'), ctx, { filename: name });
  const revealed = watchReveals(document);
  const state = (cursor: number, value: string) => ({
    title: 'Réglages de VPX',
    scope: '',
    file: '',
    vpx: '',
    tabs: [{ id: 'advanced', label: 'Avancé', icon: 'list', active: true }],
    hints: '',
    cursor,
    rows: Array.from({ length: 30 }, (_, i) => ({ kind: 'setting', label: `Réglage ${i}`, value: i === 0 ? value : '' })),
    detail: { title: `Réglage ${cursor}`, lines: ['…'] },
  });
  const list = () => document.querySelector('.list ul') as unknown as { scrollTop: number };
  const detail = () => document.querySelector('.detail') as unknown as { scrollTop: number };

  onState!(state(3, 'a'));
  list().scrollTop = 120;
  detail().scrollTop = 30;
  revealed.length = 0;
  onState!(state(3, 'b'));
  assert.equal(list().scrollTop, 120);
  assert.equal(detail().scrollTop, 30);
  assert.deepEqual(revealed, []);
  // Autre réglage : la ligne est ramenée dans la vue, son détail repart du haut.
  onState!(state(4, 'b'));
  assert.equal(list().scrollTop, 120);
  assert.ok(!detail().scrollTop);
  assert.equal(revealed.length, 1);
});

test('seul scroll-keeper.js fait défiler une liste du rendu', () => {
  const offenders: string[] = [];
  for (const file of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.js') && f !== 'scroll-keeper.js')) {
    const lines = fs.readFileSync(path.join(RENDERER, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/\.scrollIntoView\b|\.scroll(?:To|By)\s*\(|\.scroll(?:Top|Left)\s*[-+]?=(?!=)/.test(code)) offenders.push(`${file}:${i + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], 'un rendu qui fait défiler lui-même ramène la liste à chaque mise à jour : passer par CyberScroll.keeper()');
  // Toute page qui s'en sert le charge avant.
  for (const page of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.html'))) {
    const scripts = [...fs.readFileSync(path.join(RENDERER, page), 'utf8').matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]!);
    const at = scripts.indexOf('scroll-keeper.js');
    for (const user of scripts.filter((s) => s !== 'scroll-keeper.js' && fs.existsSync(path.join(RENDERER, s)) && fs.readFileSync(path.join(RENDERER, s), 'utf8').includes('CyberScroll.'))) {
      assert.ok(at >= 0 && at < scripts.indexOf(user), `${page} : scroll-keeper.js doit précéder ${user}`);
    }
  }
});
