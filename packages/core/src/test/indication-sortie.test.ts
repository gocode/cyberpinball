// Comment revenir à Cyber Pinball (demande du mainteneur, 27/11/2026) : Pinball FX, Future Pinball et les
// applications ont leur propre fenêtre, Exit n'y ramène pas, un appui long le fait, et rien ne le disait.
// Invariants :
// - la phrase est donnée au chargement d'un jeu qui n'est pas VPX (Exit y quitte tout de suite), pas au réglage de l'affichage ;
// - en borne, la pastille se pose sur le média du joueur comme sur le repli ; au bureau, elle est dans l'encart ;
// - sans phrase (VPX), l'écran de chargement ne change pas : le média du joueur reste seul ;
// - le processus principal la donne depuis la durée réelle de l'appui long (celle des lanceurs).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { APP, menuRenderer } from './menu-renderer';
import { frontendSource } from './frontend-source';
import { REPO_ROOT } from './i18n-scan';

const { loadingExitHint, appExitHint } = require(path.join(REPO_ROOT, 'app', 'dist', 'exit-hint.js')) as {
  loadingExitHint(emulator: string | undefined, holdMs: number): string | undefined;
  appExitHint(holdMs: number): string;
};

const VIDEO = 'cyber-media://fichier/D%3A%5CT%5CNeon%5Cmedias%5C(Loading)%20Neon.webm?v=1';
const HINT = 'Pour revenir à Cyber Pinball : maintiens Exit 2 s';

function loadingState(exitHint: string | undefined) {
  const title = 'Neon Galaxy';
  return {
    role: 'playfield',
    phase: 'loading',
    help: false,
    count: 3,
    position: 2,
    table: { title, manufacturer: 'Williams', year: '1992', subtitle: 'Williams · 1992' },
    neighbors: [],
    menuLayout: 'medaillons',
    medias: {},
    preload: [],
    loading: { role: 'playfield', type: 'Loading', source: 'file', url: VIDEO, kind: 'video', fit: 'cover', rotation: 0, card: { title } },
    footer: [],
    menuKeys: [],
    gameKeys: [['Start', '1']],
    loadingKeys: { title: 'Commandes de la partie', rows: [['Start', '1']], display: false },
    exitHint,
    nav: {},
  };
}

function renderer(shape: 'cab' | 'desktop') {
  const page = menuRenderer({});
  const Media = Object.getPrototypeOf(page.document.createElement('video'));
  Media.play = () => Promise.resolve();
  Media.pause = () => {};
  const html = page.document.documentElement;
  html.classList.toggle('menu-desktop', shape === 'desktop');
  html.classList.toggle('menu-cab', shape === 'cab');
  return { ...page, root: page.document.getElementById('root')! };
}

test('indication de sortie, en borne : une pastille sur le média de chargement du joueur', () => {
  const { send, root } = renderer('cab');
  send(loadingState(HINT));
  const hint = root.querySelector('.loading-exit-hint');
  assert.ok(hint, 'la pastille est là');
  // Le rendu met une espace insécable avant « : » : même phrase.
  assert.equal(hint!.textContent!.replace(/\s/g, ' '), HINT);
  assert.equal(root.querySelector('.loading-card'), null, 'rien d’autre que la pastille sur le média');
});

test('indication de sortie, au bureau : une ligne de l’encart', () => {
  const { send, root } = renderer('desktop');
  send(loadingState(HINT));
  const hints = root.querySelectorAll('.loading-exit-hint');
  assert.equal(hints.length, 1);
  assert.ok(hints[0]!.closest('.loading-card'), 'dans l’encart');
});

test('indication de sortie : sans phrase (VPX), l’écran de chargement ne change pas', () => {
  for (const shape of ['cab', 'desktop'] as const) {
    const { send, root } = renderer(shape);
    send(loadingState(undefined));
    assert.equal(root.querySelector('.loading-exit-hint'), null, shape);
  }
  const cab = renderer('cab');
  cab.send(loadingState(undefined));
  assert.equal(cab.root.textContent!.trim(), '', 'en borne, le média du joueur reste seul');
});

test('indication de sortie : donnée pour Pinball FX et Future Pinball, jamais pour VPX', () => {
  for (const emulator of ['pinballfx', 'pinballfx3', 'pinballfxmidnight', 'futurepinball']) {
    assert.equal(loadingExitHint(emulator, 2000), HINT, emulator);
  }
  assert.equal(loadingExitHint('vpx', 2000), undefined);
  assert.equal(loadingExitHint(undefined, 2000), undefined);
  assert.equal(appExitHint(1000), 'Pour revenir à Cyber Pinball : maintiens Exit 1 s');
});

test('indication de sortie : le processus principal la tire de la durée réelle de l’appui long, hors réglage de l’affichage', () => {
  const main = frontendSource();
  assert.match(main, /exitHint: state\.phase === 'loading' && role === 'playfield' && !displayMode \? loadingExitHint\(\(playing \?\? table\)\?\.emulator, PINBALLFX_EXIT_HOLD_MS\)/);
  const menu = fs.readFileSync(path.join(APP, 'src', 'applications-menu.ts'), 'utf8');
  assert.match(menu, /appExitHint\(APP_EXIT_HOLD_MS\)/, 'une application : la durée de watchAppButtons');
});
