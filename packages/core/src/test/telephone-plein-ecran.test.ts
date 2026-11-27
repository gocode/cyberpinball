// Page du téléphone en plein écran (app/renderer/telephone/telephone-plein-ecran.js) : plus de barre
// d'adresse ni d'onglets, sur Android (Chrome) comme sur iPhone (Safari), sans casser le jumelage (clé
// dans le fragment #g=) ni le verrou d'orientation du miroir. La page se joue avec un faux DOM :
// aucune fenêtre, aucun téléphone. Ce que seul un vrai téléphone montre (la barre d'adresse qui
// disparaît, l'avertissement de Chrome, le raccourci de l'iPhone) est dit dans changements/.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as vm from 'node:vm';
import { REPO_ROOT } from './i18n-scan';

const PHONE_DIR = path.join(REPO_ROOT, 'app', 'renderer', 'telephone');
const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
const page = read('app', 'renderer', 'telephone', 'telephone.html');
const main = read('app', 'renderer', 'telephone', 'telephone.js');
const css = read('app', 'renderer', 'telephone', 'telephone.css');
const relayPage = read('packages', 'service-telephone', 'public', 'index.html');
const remote = read('app', 'src', 'phone-remote.ts');

// ---------------------------------------------------------------------------
// Ce que la page déclare

test('page du téléphone : le module du plein écran est servi et chargé avant le miroir et telephone.js', () => {
  assert.ok(remote.includes("'/telephone-plein-ecran.js': 'telephone/telephone-plein-ecran.js'"), 'entrée dans PHONE_FILES');
  const at = (name: string) => page.indexOf(`<script src="${name}"></script>`);
  assert.ok(at('telephone-plein-ecran.js') > -1, 'chargé par la page');
  assert.ok(at('telephone-plein-ecran.js') < at('telephone-miroir.js'), 'avant le miroir');
  assert.ok(at('telephone-plein-ecran.js') < at('telephone.js'), 'avant telephone.js');
  // telephone.js ne refait plus ce que le module fait : il lui délègue.
  assert.match(main, /CyberScreen\.standalone\(\)/);
  assert.match(main, /CyberScreen\.homeScreenHow\(\)/);
  assert.match(main, /CyberScreen\.toggle\(\)/);
  assert.equal(/requestFullscreen/.test(main), false, 'la demande de plein écran est dans le module');
});

test('page du téléphone : écran d\'accueil sans barres sur iPhone et Android, toute la place de l\'écran', () => {
  assert.match(page, /name="viewport"[^>]*viewport-fit=cover/, 'la page prend tout l\'écran, encoche comprise');
  assert.match(page, /name="apple-mobile-web-app-capable" content="yes"/, 'iPhone : le raccourci s\'ouvre sans Safari');
  assert.match(page, /name="mobile-web-app-capable" content="yes"/);
  assert.match(page, /name="apple-mobile-web-app-status-bar-style" content="black"/);
  assert.match(page, /rel="apple-touch-icon"/);
  // Pas de manifeste : son adresse de départ perdrait la clé du téléphone gardé (#g=…), et l'iPhone
  // donne à l'application de l'écran d'accueil un stockage à part (telephone-plein-ecran.js).
  assert.doesNotMatch(page, /rel="manifest"/);
  assert.equal(remote.includes('manifest'), false, 'la borne ne sert aucun manifeste');
});

test('page du raccourci qui suit la borne : sur iPhone, elle s\'ouvre aussi sans barres, avant de renvoyer à la borne', () => {
  assert.match(relayPage, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(relayPage, /name="mobile-web-app-capable" content="yes"/);
  assert.doesNotMatch(relayPage, /rel="manifest"/, 'toujours sans manifeste : il perdrait la clé');
});

test('page du téléphone : encoche et coins arrondis en paysage (viewport-fit=cover), jamais de clé dans l\'adresse perdue', () => {
  assert.match(css, /body \{\s*margin-left: env\(safe-area-inset-left[^)]*\);\s*margin-right: env\(safe-area-inset-right/);
  assert.match(css, /\.sheet \{\s*padding-left: max\(14px, env\(safe-area-inset-left/);
  // La clé du téléphone gardé reste dans l'adresse (iPhone : seul moyen de la porter à l'écran d'accueil).
  assert.match(main, /history\.replaceState\(null, '', `#g=\$\{core\.toB64\(key\)\}`\)/);
});

// ---------------------------------------------------------------------------
// Le module, avec un faux navigateur

type Listener = (event?: unknown) => void;
interface Options {
  userAgent?: string;
  maxTouchPoints?: number;
  /** navigator.standalone (iPhone) */
  standalone?: boolean;
  /** (display-mode: standalone) (Android installé) */
  displayStandalone?: boolean;
  /** document.fullscreenEnabled */
  fullscreen?: boolean;
  /** Le navigateur refuse requestFullscreen. */
  refuse?: boolean;
  stored?: Record<string, string>;
  test?: boolean;
}
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const SAFARI_IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const DESKTOP_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const ELECTRON = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) CyberPinball/1.0 Chrome/130.0.0.0 Electron/33.0.0 Safari/537.36';

/** Charge telephone-plein-ecran.js dans un contexte à faux DOM. */
function loadScreen(o: Options = {}) {
  const listeners: Record<string, Listener[]> = {};
  const requests: Array<Record<string, unknown> | undefined> = [];
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  const storage = new Map<string, string>(Object.entries(o.stored ?? {}));
  const state = { fullscreenElement: null as unknown, visibilityState: 'visible', exits: 0 };
  const documentElement = {
    requestFullscreen: (options?: Record<string, unknown>) => {
      requests.push(options);
      if (o.refuse) return Promise.reject(new Error('refusé'));
      state.fullscreenElement = documentElement;
      return Promise.resolve();
    },
  };
  const document = {
    fullscreenEnabled: o.fullscreen ?? true,
    get fullscreenElement() {
      return state.fullscreenElement;
    },
    get visibilityState() {
      return state.visibilityState;
    },
    documentElement,
    activeElement: null,
    body: {},
    exitFullscreen: () => {
      state.exits++;
      state.fullscreenElement = null;
      return Promise.resolve();
    },
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ??= []).push(fn);
    },
  };
  const sandbox: Record<string, unknown> = {
    document,
    navigator: { userAgent: o.userAgent ?? CHROME_ANDROID, maxTouchPoints: o.maxTouchPoints ?? 5, standalone: o.standalone },
    window: { matchMedia: (q: string) => ({ matches: q.includes('standalone') && o.displayStandalone === true }), cyberFullscreenTest: o.test },
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) },
    HTMLElement: class {},
    Promise,
    t: (s: string) => s,
    setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms, live: true }),
    clearTimeout: (id: number) => {
      if (timers[id - 1]) timers[id - 1]!.live = false;
    },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(PHONE_DIR, 'telephone-plein-ecran.js'), 'utf8'), context);
  const run = <T>(code: string) => vm.runInContext(code, context) as T;
  const emit = (type: string) => (listeners[type] ?? []).forEach((fn) => fn());
  return {
    run,
    requests,
    storage,
    state,
    listeners,
    /** Un toucher qui se relâche (pointerup, capture) : le geste que le navigateur exige. */
    touch: async () => {
      emit('pointerup');
      await new Promise((r) => setImmediate(r));
    },
    /** Le navigateur change l'état du plein écran (entrée ou sortie) : fullscreenchange. */
    change: (element: boolean) => {
      state.fullscreenElement = element ? documentElement : null;
      emit('fullscreenchange');
    },
    visibility: (v: 'visible' | 'hidden') => {
      state.visibilityState = v;
      emit('visibilitychange');
    },
    /** Écoule les minuteries en attente. */
    tick: () => timers.filter((x) => x.live).forEach((x) => ((x.live = false), x.fn())),
    screen: <T>(expr: string) => run<T>(`CyberScreen.${expr}`),
  };
}

test('plein écran : le téléphone est reconnu (iPhone, iPad en mode bureau, Android, ordinateur)', () => {
  assert.equal(loadScreen({ userAgent: SAFARI_IPHONE }).screen('platform()'), 'ios');
  assert.equal(loadScreen({ userAgent: SAFARI_IPAD_DESKTOP, maxTouchPoints: 5 }).screen('platform()'), 'ios');
  assert.equal(loadScreen({ userAgent: SAFARI_IPAD_DESKTOP, maxTouchPoints: 0 }).screen('platform()'), 'other', 'un Mac sans écran tactile');
  assert.equal(loadScreen({ userAgent: CHROME_ANDROID }).screen('platform()'), 'android');
});

test('plein écran : « ouverte depuis l\'écran d\'accueil » (iPhone : navigator.standalone, Android : display-mode)', () => {
  assert.equal(loadScreen().screen('standalone()'), false);
  assert.equal(loadScreen({ userAgent: SAFARI_IPHONE, standalone: true }).screen('standalone()'), true);
  assert.equal(loadScreen({ displayStandalone: true }).screen('standalone()'), true);
});

test('plein écran : le guide « écran d\'accueil » dit la bonne chose selon le téléphone', () => {
  const iphone = loadScreen({ userAgent: SAFARI_IPHONE, fullscreen: false }).screen<string>('homeScreenHow()');
  assert.match(iphone, /Safari/);
  assert.match(iphone, /Partager/);
  assert.match(iphone, /Sur l’écran d’accueil/);
  assert.match(iphone, /Ouvrir comme app web/, 'iOS 26 : l\'option qui garde les barres si elle est coupée');
  assert.doesNotMatch(iphone, /premier toucher/, 'l\'iPhone n\'a pas de plein écran à la demande');
  const android = loadScreen().screen<string>('homeScreenHow()');
  assert.match(android, /menu du navigateur \(⋮\)/);
  assert.match(android, /plein écran au premier toucher/);
  // Android sans API de plein écran : pas de promesse.
  assert.doesNotMatch(loadScreen({ fullscreen: false }).screen<string>('homeScreenHow()'), /premier toucher/);
  assert.match(loadScreen({ userAgent: DESKTOP_FIREFOX }).screen<string>('homeScreenHow()'), /menu du navigateur/);
});

test('plein écran Android : demandé au premier toucher, barres de navigation masquées, une seule fois tant que ça dure', async () => {
  const s = loadScreen();
  assert.equal(s.screen('possible()'), true);
  await s.touch();
  // JSON : les objets d'un autre contexte vm ne passent pas deepEqual.
  assert.deepEqual(JSON.parse(JSON.stringify(s.requests)), [{ navigationUI: 'hide' }]);
  assert.equal(s.screen('active()'), true);
  // Déjà en plein écran : les touchers suivants ne redemandent rien (Chrome avertirait à chaque fois).
  await s.touch();
  await s.touch();
  assert.equal(s.requests.length, 1);
});

test('plein écran : jamais sur iPhone (déjà sans barres depuis l\'écran d\'accueil, et pas d\'API dans Safari)', async () => {
  const tab = loadScreen({ userAgent: SAFARI_IPHONE, fullscreen: false });
  await tab.touch();
  assert.equal(tab.requests.length, 0);
  assert.equal(tab.screen('possible()'), false);
  // Raccourci de l'écran d'accueil : même avec une API, rien à demander.
  const home = loadScreen({ userAgent: SAFARI_IPHONE, standalone: true });
  await home.touch();
  assert.equal(home.requests.length, 0);
  assert.equal(home.screen('possible()'), false);
  // Application installée (Android, display-mode standalone) : idem.
  const installed = loadScreen({ displayStandalone: true });
  await installed.touch();
  assert.equal(installed.requests.length, 0);
});

test('plein écran : jamais dans Electron (les essais sont hors écran), sauf essai qui le simule', async () => {
  const real = loadScreen({ userAgent: ELECTRON });
  await real.touch();
  assert.equal(real.requests.length, 0);
  assert.equal(real.screen('possible()'), false);
  const simulated = loadScreen({ userAgent: ELECTRON, test: true });
  await simulated.touch();
  assert.equal(simulated.requests.length, 1);
});

test('plein écran : refusé par le navigateur, la page ne redemande plus pendant cette visite', async () => {
  const s = loadScreen({ refuse: true });
  await s.touch();
  await s.touch();
  await s.touch();
  assert.equal(s.requests.length, 1, 'une seule tentative');
  assert.equal(s.screen('possible()'), false);
  // Le menu ⋮ permet de réessayer.
  s.screen('toggle()');
  await new Promise((r) => setImmediate(r));
  assert.equal(s.requests.length, 2);
});

test('plein écran : quitté exprès (geste de Chrome), il n\'est plus repris, et ce choix survit à la visite', async () => {
  const s = loadScreen();
  await s.touch();
  s.change(false); // sortie sans que la page quitte l'écran : voulue
  s.tick(); // 700 ms plus tard
  assert.equal(s.storage.get('cyberpinball.plein-ecran'), 'non');
  await s.touch();
  assert.equal(s.requests.length, 1, 'plus de demande au toucher');
  // Une visite suivante, même choix.
  const next = loadScreen({ stored: { 'cyberpinball.plein-ecran': 'non' } });
  await next.touch();
  assert.equal(next.requests.length, 0);
  assert.equal(next.screen('isOff()'), true);
});

test('plein écran : sortie subie (autre application, écran verrouillé), il est repris au prochain toucher', async () => {
  // La page passe en arrière-plan avant que la sortie soit jugée (cas Android : visibilitychange après).
  const late = loadScreen();
  await late.touch();
  late.change(false);
  late.visibility('hidden');
  late.tick();
  assert.equal(late.storage.has('cyberpinball.plein-ecran'), false, 'pas de choix enregistré');
  late.visibility('visible');
  await late.touch();
  assert.equal(late.requests.length, 2, 'repris au toucher');
  // La page est déjà cachée quand le plein écran se termine.
  const early = loadScreen();
  await early.touch();
  early.visibility('hidden');
  early.change(false);
  early.tick();
  assert.equal(early.storage.has('cyberpinball.plein-ecran'), false);
  early.visibility('visible');
  await early.touch();
  assert.equal(early.requests.length, 2);
});

test('plein écran : le menu ⋮ le quitte (et ne le reprend plus) puis le rend', async () => {
  const s = loadScreen();
  await s.touch();
  s.screen('toggle()'); // quitter
  assert.equal(s.state.exits, 1);
  assert.equal(s.storage.get('cyberpinball.plein-ecran'), 'non');
  s.change(false); // fullscreenchange qui suit : voulue, aucune minuterie ne le conteste
  s.tick();
  await s.touch();
  assert.equal(s.requests.length, 1, 'pas repris de lui-même');
  s.screen('toggle()'); // le rendre
  await new Promise((r) => setImmediate(r));
  assert.equal(s.requests.length, 2);
  assert.equal(s.storage.has('cyberpinball.plein-ecran'), false);
});

// ---------------------------------------------------------------------------
// Le verrou d'orientation du miroir : repris quand le plein écran est accordé

/** Charge telephone-miroir.js avec un faux DOM qui garde ses écoutes ; `locks` : les appels à screen.orientation. */
function loadMirror() {
  const listeners: Record<string, Listener[]> = {};
  const locks: string[] = [];
  const noop = () => undefined;
  const view = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }), classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, setPointerCapture: noop };
  const context2d = { clearRect: noop, setTransform: noop, translate: noop, rotate: noop, drawImage: noop };
  const canvas = { style: {}, width: 1, height: 1, getContext: () => context2d, addEventListener: noop };
  const tab = { setAttribute: noop, addEventListener: noop, replaceChildren: noop };
  const elements: Record<string, unknown> = { mirror: view, 'mirror-canvas': canvas, 'nav-mirror': tab, 'nav-pad': tab, 'mirror-zoom-reset': tab, 'mirror-page-zoom-in': tab, 'mirror-page-zoom-out': tab };
  const doc = {
    getElementById: (id: string) => elements[id],
    createElement: () => ({}),
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ??= []).push(fn);
    },
    hidden: false,
    fullscreenElement: null as unknown,
    body: { dataset: {} },
  };
  const sandbox: Record<string, unknown> = {
    document: doc,
    window: { devicePixelRatio: 1, addEventListener: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    screen: { orientation: { lock: (o: string) => (locks.push(o), Promise.resolve()), unlock: () => locks.push('unlock') } },
    navigator: {},
    Promise,
    clearTimeout,
    setTimeout,
    mode: 'browser',
    state: 'paired',
    t: (s: string) => s,
    cyberIcon: () => ({}),
    send: () => true,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(PHONE_DIR, 'telephone-miroir.js'), 'utf8'), context);
  return {
    locks,
    run: (code: string) => vm.runInContext(code, context) as unknown,
    fullscreenChange: (on: boolean) => {
      doc.fullscreenElement = on ? {} : null;
      (listeners.fullscreenchange ?? []).forEach((fn) => fn());
    },
  };
}

test('miroir : le verrou d\'orientation refusé avant le plein écran est repris quand il est accordé', () => {
  const page = loadMirror();
  page.run('mirror.available = true; mirror.choice = true; mirror.landscape = true;');
  page.fullscreenChange(true);
  assert.deepEqual(page.locks, ['landscape'], 'fenêtre en paysage : paysage');
  page.run('mirror.landscape = false;');
  page.fullscreenChange(true);
  assert.deepEqual(page.locks, ['landscape', 'portrait'], 'fenêtre en portrait : portrait');
});

test('miroir : sans miroir choisi, le plein écran ne touche pas à l\'orientation ; en sortir non plus', () => {
  const page = loadMirror();
  page.fullscreenChange(true);
  assert.deepEqual(page.locks, [], 'pavé : orientation libre');
  page.run('mirror.available = true; mirror.choice = true;');
  page.fullscreenChange(false);
  assert.deepEqual(page.locks, [], 'sortie du plein écran : le navigateur lève le verrou lui-même');
});
