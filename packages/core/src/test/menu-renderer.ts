// Le vrai rendu du menu (media.js, library.js, frontend.js) dans un document linkedom, pour
// les essais : images « chargées » dès qu'elles ont une adresse, états envoyés comme par
// frontend.ts. Sans mise en page : les tailles valent 0, la fenêtre a la forme « borne »
// tant que l'essai ne pose pas html.menu-desktop lui-même.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { parseHTML } from 'linkedom';

export const APP = path.join(__dirname, '..', '..', '..', '..', 'app');

/** `extra` : globales de plus pour la page (window.CyberFallback simulé, par exemple). */
export function menuRenderer(extra: Record<string, unknown> = {}) {
  const html = fs.readFileSync(path.join(APP, 'renderer', 'frontend.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
  const { window, document } = parseHTML(html);
  const Img = Object.getPrototypeOf(document.createElement('img'));
  Object.defineProperty(Img, 'complete', { configurable: true, get() { return Boolean(this.getAttribute('src')); } });
  Object.defineProperty(Img, 'naturalWidth', { configurable: true, get() { return this.getAttribute('src') ? 400 : 0; } });
  Object.defineProperty(Img, 'naturalHeight', { configurable: true, get() { return this.getAttribute('src') ? 400 : 0; } });
  let onState: ((s: unknown) => void) | undefined;
  const ctx: Record<string, unknown> = {
    document,
    location: { search: '?role=playfield' },
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (f: () => void) => setTimeout(f, 0),
    ResizeObserver: class {
      observe() {}
    },
    getComputedStyle: () => ({ fontSize: '16px' }),
    CSS: { escape: (s: string) => s.replace(/["\\]/g, '\\$&') },
    Image: function Image() {
      return document.createElement('img');
    },
    HTMLElement: window.HTMLElement,
    cyber: { onState: (f: (s: unknown) => void) => (onState = f), ready() {}, act() {}, mediaError() {} },
    CyberMenuAudio: { attachVideo() {}, update() {} },
    ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const name of ['i18n.js', 'icons.js', 'media.js', 'library.js', 'frontend.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, 'renderer', name), 'utf8'), ctx, { filename: name });
  }
  const send = (s: unknown) => onState!(s);
  return { document, send };
}

/** État du menu comme viewFor (frontend.ts) l'envoie, pour une roue de trois tables. */
export function menuState(wheels: Record<string, string | undefined>, titles: Record<string, string> = {}) {
  const keys = Object.keys(wheels);
  const neighbors = keys.map((key, i) => ({ offset: i - 1, key, title: titles[key] ?? key, wheel: wheels[key] }));
  return {
    role: 'playfield',
    phase: 'menu',
    help: false,
    count: keys.length,
    position: 2,
    table: { title: keys[1], subtitle: '' },
    neighbors,
    menuLayout: 'medaillons',
    medias: {},
    preload: [],
    footer: [],
    menuKeys: [],
    gameKeys: [],
    loadingKeys: { title: '', rows: [] },
    nav: {},
  };
}
