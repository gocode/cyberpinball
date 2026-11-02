// Bloqueur de publicités du navigateur intégré (adblock.ts, app/src/ad-blocker.ts) : quand les
// listes se rafraîchissent, quelles pages ne sont jamais filtrées (forums des tables), ce que dit
// la bascule du menu ; et le réglage gardé dans acquisition.json (bloquer par défaut).

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { loadWaitList, saveWaitList } from '../acquisition';
import { AD_LISTS_MAX_AGE_MS, adBlockExempt, adBlockLabel, adListsStale, combineScriptlets } from '../adblock';
import { setLanguage } from '../i18n';
import { SOURCE_SITES } from '../sitesessions';

test('les listes se rafraîchissent une fois par jour, et quand elles manquent', () => {
  const now = Date.UTC(2026, 10, 1, 12);
  assert.equal(adListsStale(undefined, now), true);
  assert.equal(adListsStale(now - 60_000, now), false);
  assert.equal(adListsStale(now - AD_LISTS_MAX_AGE_MS + 1, now), false);
  assert.equal(adListsStale(now - AD_LISTS_MAX_AGE_MS, now), true);
  // Horloge reculée (date du fichier dans le futur) : on ne s'y fie pas.
  assert.equal(adListsStale(now + 3_600_000, now), true);
  assert.equal(adListsStale(Number.NaN, now), true);
});

test('les forums des tables ne sont jamais filtrés, sous-domaines compris ; YouTube et la recherche le sont', () => {
  for (const site of SOURCE_SITES) {
    assert.equal(adBlockExempt(site.home), true, site.home);
    assert.equal(adBlockExempt(site.login), true, site.login);
    assert.equal(adBlockExempt(`https://files.${site.domain}/x.zip`), true, site.domain);
  }
  assert.equal(adBlockExempt('https://www.youtube.com/watch?v=abcdefghijk'), false);
  assert.equal(adBlockExempt('https://www.google.com/search?q=pinball'), false);
  assert.equal(adBlockExempt('https://notvpuniverse.com/'), false, 'un domaine qui finit pareil n’est pas le forum');
  // Ce qui n'est pas une page du web, ou une requête sans page connue.
  for (const url of [undefined, '', 'about:blank', 'data:text/html,x', 'devtools://devtools/x', 'file:///C:/x.html', 'cyberpinball-media://x']) assert.equal(adBlockExempt(url), true, String(url));
});

test('la bascule du menu dit l’état du bloqueur', () => {
  setLanguage('fr');
  assert.equal(adBlockLabel('off').label, 'Bloquer les publicités : non');
  for (const state of ['ready', 'loading', 'unavailable'] as const) assert.equal(adBlockLabel(state).label, 'Bloquer les publicités : oui');
  assert.match(adBlockLabel('ready').detail, /YouTube/);
  assert.match(adBlockLabel('unavailable').detail, /hors ligne/);
  assert.notEqual(adBlockLabel('loading').detail, adBlockLabel('ready').detail);
  setLanguage('en');
  assert.equal(adBlockLabel('ready').label, 'Block ads: on');
  setLanguage('fr');
});

test('scriptlets : un seul script, chacun dans sa fonction, outils communs (YouTube vide, 02/11/2026)', () => {
  // Comme Ghostery les assemble : l'en-tête, des outils au premier niveau, puis l'appel.
  const header = "if (typeof scriptletGlobals === 'undefined') { var scriptletGlobals = {}; }";
  const tools = 'class JSONPath { static create() { return new JSONPath(); } } function safeSelf() { if (scriptletGlobals.safeSelf) return scriptletGlobals.safeSelf; page.captures += 1; return (scriptletGlobals.safeSelf = { apply: page.apply }); }';
  const scriptlet = (name: string) => [header, tools, `(function ${name}() { safeSelf(); JSONPath.create(); page.ran.push('${name}'); })()`].join(';');
  const broken = [header, 'page.ran.push("panne"); throw new Error("panne");'].join(';');
  const combined = combineScriptlets([scriptlet('premier'), broken, scriptlet('second')])!;
  const page = { ran: [] as string[], captures: 0, apply: () => undefined };
  const context = vm.createContext({ page });
  // Avant : exécutés l'un après l'autre dans la page, le second redéclarait JSONPath.
  vm.runInContext(scriptlet('premier'), context);
  assert.throws(() => vm.runInContext(scriptlet('second'), context), /JSONPath/);
  // Après : tout passe, la panne n'arrête pas la suite, safeSelf n'est capturé qu'une fois.
  const fresh = { ran: [] as string[], captures: 0, apply: () => undefined };
  const clean = vm.createContext({ page: fresh });
  vm.runInContext(combined, clean);
  assert.deepEqual(fresh.ran, ['premier', 'panne', 'second']);
  assert.equal(fresh.captures, 1);
  // Rien n'est laissé dans la page (YouTube cherche les traces des bloqueurs).
  assert.equal(vm.runInContext('typeof scriptletGlobals + typeof JSONPath + typeof safeSelf', clean), 'undefinedundefinedundefined');
  assert.equal(combineScriptlets([]), undefined);
});

test('bloquer est le réglage par défaut ; « montrer les publicités » est gardé dans acquisition.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-adblock-'));
  try {
    assert.equal(loadWaitList(dir).adsShown, undefined);
    saveWaitList(dir, { items: [], adsShown: true });
    assert.equal(loadWaitList(dir).adsShown, true);
    // Valeur abîmée : on revient au blocage.
    fs.writeFileSync(path.join(dir, 'acquisition.json'), JSON.stringify({ items: [], adsShown: 'oui' }));
    assert.equal(loadWaitList(dir).adsShown, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
