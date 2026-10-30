// Texte plus long que l'écran, où il n'y a rien à choisir (reading.ts) : aux boutons seuls, on doit
// pouvoir le lire en entier. 30 octobre 2026, PinCab : les nouveautés de la 0.1.5-essai.10 dépassaient
// de leur cadre, et seules la molette ou la barre de défilement les atteignaient. Ces tests fixent
// la classe de problème :
// - le parcours aux flippers passe par le texte (avant la première action), page après page, et
//   en ressort à son bout ; un flipper tenu s'arrête au bout ;
// - le vrai rendu met le texte dans un cadre seulement s'il dépasse, envoie sa mesure (haut, bas)
//   au processus principal et fait défiler une page par appui, une seule fois chacune ;
// - tout texte qui défile sans rien à choisir le dit (data-reading), et le garde-fou de mise en page
//   relève, dans le rendu réel de toute fenêtre, celui qui ne le dit pas.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { entersReading, readingStep, type ReadingEdges } from '..';
import { menuRenderer } from './menu-renderer';

const APP = path.join(__dirname, '..', '..', '..', '..', 'app');
const read = (...p: string[]) => fs.readFileSync(path.join(APP, ...p), 'utf8');

const edges = (top: boolean, bottom: boolean): ReadingEdges => ({ overflow: true, top, bottom });

test('le texte qui dépasse est une étape du parcours : flipper gauche sur la première action, droit sur la dernière', () => {
  const e = edges(true, false);
  assert.equal(entersReading(e, 3, 0, -1), true, 'flipper gauche sur la première action : le texte, au-dessus');
  assert.equal(entersReading(e, 3, 2, 1), true, 'flipper droit sur la dernière : le texte (le parcours fait le tour)');
  assert.equal(entersReading(e, 3, 1, -1), false, 'entre deux actions : le parcours habituel');
  assert.equal(entersReading(e, 3, 0, 1), false);
  assert.equal(entersReading({ overflow: false, top: true, bottom: true }, 3, 0, -1), false, 'un texte qui tient dans l’écran ne s’ajoute pas au parcours');
  assert.equal(entersReading(undefined, 3, 0, -1), false, 'pas encore mesuré : le parcours habituel');
});

test('dans le texte : une page par appui, puis les actions à son bout ; un flipper tenu s’y arrête', () => {
  assert.deepEqual(readingStep(edges(true, false), 3, 1), { reading: true, scroll: 1 }, 'il reste du texte : une page de plus');
  assert.deepEqual(readingStep(edges(false, false), 3, -1), { reading: true, scroll: -1 });
  assert.deepEqual(readingStep(edges(false, true), 3, 1), { reading: false, cursor: 0 }, 'en bas, le flipper droit passe à la première action');
  assert.deepEqual(readingStep(edges(true, false), 3, -1), { reading: false, cursor: 2 }, 'en haut, le flipper gauche passe à la dernière');
  assert.deepEqual(readingStep(edges(false, true), 3, 1, true), { reading: true }, 'tenu : il s’arrête au bout, sans sortir du texte');
  assert.deepEqual(readingStep(edges(false, true), 0, 1), { reading: true }, 'sans action, on reste dans le texte');
});

// ---------- Rendu réel (library.js, scroll-keeper.js) ----------

function state(library: Record<string, unknown>) {
  return { role: 'playfield', phase: 'library', help: false, count: 1, position: 1, neighbors: [], footer: [], gameKeys: [], menuKeys: [], nav: {}, library: { screen: 'custom', heading: 'Mise à jour', back: 'Retour', hint: '', cursor: 0, actions: [{ label: 'Mettre à jour maintenant' }, { label: 'Plus tard' }], sections: [{ title: 'Nouveautés', rows: [{ text: 'Une' }, { text: 'Deux' }] }], ...library } };
}
/** Dernière action envoyée, recopiée hors du contexte de la page (comparaison en profondeur). */
const last = (acts: unknown[]) => JSON.parse(JSON.stringify(acts.at(-1)));
const reading = (active: boolean, move = 0, dir = 1) => ({ key: 7, active, move: { id: move, dir }, tag: active ? { key: 'Exit', text: 'Revenir aux actions' } : { key: 'MagnaSave', text: 'Faire défiler le texte' } });

/** Rendu dont le texte mesure `height` pour une vue de 300 (linkedom n'a pas de mise en page). */
function renderer(height: number) {
  const acts: Record<string, unknown>[] = [];
  let onStateHook: ((s: unknown) => void) | undefined;
  const r = menuRenderer({ cyber: { onState: (f: (s: unknown) => void) => (onStateHook = f), ready() {}, act: (a: Record<string, unknown>) => acts.push(a), mediaError() {} } });
  const proto = (r.window.HTMLElement as unknown as { prototype: object }).prototype;
  const size = (name: string, value: (el: { classList?: { contains(c: string): boolean } }) => number) =>
    Object.defineProperty(proto, name, { configurable: true, get() { return value(this); } });
  size('scrollHeight', (el) => (el.classList?.contains('lib-content') ? height : 0));
  size('clientHeight', (el) => (el.classList?.contains('lib-content') ? 300 : 0));
  return { ...r, send: (s: unknown) => onStateHook!(s), acts };
}

test('rendu : le texte qui dépasse prend un cadre, avec la part lue et son repère ; sa mesure part au processus principal', () => {
  const { document, send, acts } = renderer(1000);
  send(state({ reading: reading(false) }));
  const frame = document.querySelector('.lib-reading')!;
  assert.ok(frame, 'cadre de lecture absent');
  assert.ok(frame.classList.contains('overflows'), 'le texte dépasse : le cadre se montre');
  assert.ok(frame.hasAttribute('data-reading'), 'le texte dit qu’il se lit aux boutons (garde-fou)');
  assert.equal(frame.querySelector('.lib-keycap')?.textContent, 'MagnaSave');
  assert.equal(frame.querySelector('.lib-zone-tag-text')?.textContent, 'Faire défiler le texte');
  assert.match(frame.querySelector('.lib-reading-read')?.textContent ?? '', /30 %/, 'part lue : 300 sur 1000');
  assert.deepEqual(last(acts), { type: 'reading', key: 7, overflow: true, top: true, bottom: false });
  const sent = acts.length;
  send(state({ reading: reading(false) }));
  assert.equal(acts.length, sent, 'même mesure : rien de plus n’est envoyé (aucune boucle de rendus)');
});

test('rendu : une page par appui, une seule fois chacune, jusqu’au bas du texte', () => {
  const { document, send, acts } = renderer(700);
  const content = () => document.querySelector('.lib-reading > .lib-content') as unknown as { scrollTop: number };
  send(state({ reading: reading(true), cursor: -1 }));
  assert.ok(document.querySelector('.lib-reading')!.classList.contains('active'), 'dans le texte, son cadre porte le choix');
  assert.ok(!document.querySelector('.lib-action.current'), 'aucune action choisie pendant la lecture');
  send(state({ reading: reading(true, 1, 1), cursor: -1 }));
  assert.equal(content().scrollTop, 255, 'une page : 85 % de la vue');
  send(state({ reading: reading(true, 1, 1), cursor: -1 }));
  assert.equal(content().scrollTop, 255, 'un rendu de plus (tic) ne refait pas la page');
  send(state({ reading: reading(true, 2, 1), cursor: -1 }));
  assert.equal(content().scrollTop, 400, 'arrêté au bas du texte');
  assert.deepEqual(last(acts), { type: 'reading', key: 7, overflow: true, top: false, bottom: true }, 'le bas est signalé : le flipper suivant mène aux actions');
});

test('rendu : un texte qui tient dans l’écran n’a pas de cadre visible, et le dit', () => {
  const { document, send, acts } = renderer(200);
  send(state({ reading: reading(false) }));
  assert.ok(!document.querySelector('.lib-reading')!.classList.contains('overflows'));
  assert.deepEqual(last(acts), { type: 'reading', key: 7, overflow: false, top: true, bottom: true });
  const css = read('renderer', 'library.css');
  assert.match(css, /\.lib-reading:not\(\.overflows\) > \.lib-zone-bar\s*\{\s*display:\s*none/, 'sans dépassement, ni bandeau ni repère');
});

// ---------- Classe de problème : tout texte qui défile est à la portée des boutons ----------

test('tout texte à lire qui défile le dit (data-reading), et le garde-fou relève celui qui ne le dit pas', () => {
  assert.match(read('renderer', 'library.js'), /frame\.dataset\.reading = ''/, 'texte d’un écran du menu');
  assert.match(read('renderer', 'settings.js'), /box\.dataset\.reading = ''/, 'détail des réglages de VPX');
  const check = read('src', 'layout-check.ts');
  assert.match(check, /texte qui défile hors d’atteinte des boutons/, 'règle du garde-fou de mise en page');
  assert.match(check, /closest\('\[data-reading\], \[data-choices\]'\)/);
  // Les réglages de VPX : MagnaSave fait défiler le détail sans quitter la liste.
  const settings = read('src', 'settings.ts');
  assert.match(settings, /detailUp: magna\.filter/);
  assert.match(settings, /is\(KEYS\.detailUp\) \|\| is\(KEYS\.detailDown\)/);
  // Le défilement passe par scroll-keeper.js, seul à faire défiler une liste (defilement.test.ts).
  assert.match(read('renderer', 'settings.js'), /CyberScroll\.page\(detailBox/);
  assert.match(read('renderer', 'library.js'), /CyberScroll\.page\(content/);
});

test('la mesure du rendu ne réveille pas la borne : elle passe avant le mode attente', () => {
  const src = read('src', 'frontend.ts');
  const at = src.indexOf("if (action.type === 'reading') return library.handleAction(action);");
  assert.ok(at > 0 && at < src.indexOf('attract.activity()', src.indexOf("ipcMain.on('action'")), 'la mesure doit précéder hours.activity / attract.activity');
});
