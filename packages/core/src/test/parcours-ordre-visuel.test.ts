// Parcours aux flippers : l'ordre de l'affichage, de haut en bas (listzones.ts, visualOrder).
//
// Retour d'essai du 10/11/2026, import du Juke-box au bureau (morceaux à gauche, choix à droite,
// « Importer » et « Annuler » dessous) : du dernier morceau, le flipper remontait aux choix du haut,
// puis passait à « Importer » par-dessus les morceaux. La classe de problème : un parcours qui suit le
// rang des actions au lieu de leur place à l'écran. Ces tests fixent, pour tout écran décrit (gestion,
// import, choix, compte du Juke-box et tous les écrans de la bibliothèque) :
// - le parcours passe une fois par chaque action, dans l'ordre de l'affichage, sans retour en arrière ;
// - il ne fait le tour qu'aux deux bouts de l'écran ; en remontant, c'est l'ordre inverse ;
// - le rendu place bien le contenu comme visualOrder le suppose.
//
// Et la pré-écoute : le MagnaSave droit se lit comme sur la roue, MagnaSave relevés ou non
// (une borne Pinscape envoie Ctrl gauche et Ctrl droit sans qu'on les relève).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  collectionKeys,
  DEFAULT_BUTTONS,
  joystickCode,
  listenKeys,
  visualOrder,
  zoneStep,
  zoneSwitchKeys,
  type ButtonsSource,
  type CabinetButtons,
  type ZoneSource,
} from '..';

const APP = path.join(__dirname, '..', '..', '..', '..', 'app');
const read = (...p: string[]) => fs.readFileSync(path.join(APP, ...p), 'utf8');

/** L'écran d'import du Juke-box (jukebox-menu.ts, importScreen) : lien, résumé, morceaux, puis les choix en colonne latérale. */
function importLike(songs: number): { source: ZoneSource; count: number; options: number[]; songs: number[]; bottom: number[] } {
  const songIdx = [...Array(songs).keys()];
  let next = songs;
  const group = (n: number) => Array.from({ length: n }, () => next++);
  const mode = group(2);
  const quality = group(3);
  const target = group(2);
  const take = group(4);
  const bottom = group(2);
  const source: ZoneSource = {
    sections: [
      { rows: [{}] },
      { rows: [{}] },
      { rows: songIdx.map((action) => ({ action, pick: true })) },
      ...[mode, quality, target, take].map((g) => ({ side: true, options: true, title: 'Choix', rows: g.map((action) => ({ action, pick: true })) })),
      { side: true, rows: [{}] },
    ],
  };
  return { source, count: next, options: [...mode, ...quality, ...target, ...take], songs: songIdx, bottom };
}

/** Le tour complet aux flippers depuis `start` : chaque élément atteint, dans l'ordre. */
function walk(order: readonly number[], start: number, dir: -1 | 1): number[] {
  const out = [start];
  for (let i = 1; i < order.length; i++) out.push(zoneStep(undefined, order.length, out[i - 1]!, dir, order));
  return out;
}

test('import du Juke-box au bureau : les choix du haut, tous les morceaux, puis « Importer » et « Annuler »', () => {
  const s = importLike(9);
  const order = visualOrder(s.source, s.count, true);
  assert.deepEqual(order, [...s.options, ...s.songs, ...s.bottom]);
  const step = (at: number, dir: -1 | 1) => zoneStep(undefined, s.count, at, dir, order);
  assert.equal(step(s.songs.at(-1)!, 1), s.bottom[0], 'au bout des morceaux : la zone du bas, jamais celle du haut');
  assert.equal(step(s.options.at(-1)!, 1), s.songs[0], 'au bout des choix du haut : les morceaux, sans les sauter');
  assert.equal(step(s.songs[0]!, -1), s.options.at(-1), 'en remontant : les choix du haut');
  assert.equal(step(s.bottom.at(-1)!, 1), s.options[0], 'le tour ne se fait qu’au bout de l’écran');
  assert.equal(step(s.options[0]!, -1), s.bottom.at(-1));
});

test('import du Juke-box en borne : les morceaux, puis les choix dessous, puis « Importer » et « Annuler »', () => {
  const s = importLike(9);
  const order = visualOrder(s.source, s.count, false);
  assert.deepEqual(order, [...s.songs, ...s.options, ...s.bottom]);
  assert.equal(zoneStep(undefined, s.count, s.songs.at(-1)!, 1, order), s.options[0]);
  assert.equal(zoneStep(undefined, s.count, s.bottom.at(-1)!, 1, order), s.songs[0]);
});

/** Générateur déterministe (les écrans d'essai varient, le test reste reproductible). */
function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

/** Écran au hasard : sections (contenu ou colonne latérale, listes d'options ou non), cartes, actions mêlées dans le désordre. */
function randomScreen(r: () => number): { source: ZoneSource; count: number } {
  const count = 3 + Math.floor(r() * 25);
  const ranks = [...Array(count).keys()].sort(() => r() - 0.5);
  let used = 0;
  const take = (n: number) => ranks.slice(used, (used = Math.min(count, used + n)));
  const sections: ZoneSource['sections'][number][] = [];
  const nSections = Math.floor(r() * 5);
  for (let i = 0; i < nSections; i++) {
    const rows = take(Math.floor(r() * 6)).map((action) => ({ action, pick: r() < 0.8 }));
    sections.push({ rows, ...(r() < 0.3 ? { side: true } : {}), ...(r() < 0.3 ? { options: true } : {}), ...(r() < 0.5 ? { title: 'T' } : {}) });
  }
  // Cartes de médias : jamais avec une colonne latérale (les choix d'un import), aucun écran ne les mêle.
  const media = r() < 0.3 && !sections.some((x) => x.side) ? { cards: take(Math.floor(r() * 5)).map((action) => ({ action })) } : undefined;
  return { source: { sections, ...(media ? { media } : {}) }, count };
}

/** Bloc d'affichage d'une action, de haut en bas : contenu (et sa colonne latérale), puis les actions de l'écran. */
function block(source: ZoneSource, action: number, landscape: boolean): number {
  const side = source.sections.some((s) => s.side);
  const inSide = source.sections.some((s) => s.side && s.rows.some((r) => r.pick && r.action === action));
  const inMain = source.sections.some((s) => !s.side && s.rows.some((r) => r.pick && r.action === action)) || Boolean(source.media?.cards.some((c) => c.action === action));
  if (inSide) return landscape ? 0 : 1;
  if (inMain) return landscape && side ? 1 : 0;
  return 2;
}

test('tout écran : le parcours aux flippers passe une fois par chaque action, de haut en bas, sans retour en arrière', () => {
  const r = rng(20261110);
  for (let k = 0; k < 400; k++) {
    const { source, count } = randomScreen(r);
    for (const landscape of [false, true]) {
      const order = visualOrder(source, count, landscape);
      assert.deepEqual([...order].sort((a, b) => a - b), [...Array(count).keys()], 'chaque action, une seule fois');
      // Aller : l'ordre de l'affichage ; retour : son inverse ; le tour ne se fait qu'aux deux bouts.
      assert.deepEqual(walk(order, order[0]!, 1), order);
      assert.deepEqual(walk(order, order.at(-1)!, -1), [...order].reverse());
      assert.equal(zoneStep(undefined, count, order.at(-1)!, 1, order), order[0]);
      // Jamais un bloc d'avant après un bloc d'après (contenu, colonne latérale, actions de l'écran).
      const blocks = order.map((a) => block(source, a, landscape));
      for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i]! >= blocks[i - 1]!, `retour en arrière à ${order[i]} (${JSON.stringify(source)})`);
      // Dans une section, ses lignes dans leur ordre.
      for (const s of source.sections) {
        const picks = s.rows.filter((x) => x.pick).map((x) => order.indexOf(x.action!));
        for (let i = 1; i < picks.length; i++) assert.ok(picks[i]! > picks[i - 1]!);
      }
    }
  }
});

test('le rendu place le contenu comme le parcours le suppose', () => {
  const js = read('renderer', 'library.js');
  const css = read('renderer', 'library.css');
  // Colonne latérale après le reste du contenu, actions de l'écran après le contenu.
  assert.match(js, /content\.append\(main, side\)/);
  assert.match(js, /\(section\.side \? side : main\)\.append\(box\)/);
  assert.match(js, /body\.append\(actions\)/);
  // En borne, la colonne latérale passe dessous ; au bureau, à droite.
  assert.match(css, /@container \(orientation: portrait\) \{\s*\.lib-content\.with-side \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  // L'écran d'import au bureau : « Importer » et « Annuler » sous le contenu.
  assert.match(css, /\.lib-jukebox\.jukebox-import \.lib-body \{\s*grid-template-columns: minmax\(0, 1fr\);\s*grid-template-rows: minmax\(0, 1fr\) auto;/);
  // Les flippers (et Tab) de tout écran décrit suivent cet ordre ; la ligne voisine pendant l'écoute aussi.
  const library = read('src', 'library.ts');
  assert.match(library, /const order = visualOrder\(built, n, host\.landscape\?\.\(\) \?\? false\)/);
  assert.equal(library.match(/zoneStep\(zones, n, cursor, dir, order\)/g)?.length, 2);
  assert.doesNotMatch(library, /zoneStep\(zones, n, cursor, dir\)/);
  assert.match(read('src', 'jukebox-menu.ts'), /zoneStep\(undefined, n, at, dir, visualOrder\(built, n, host\.landscape\(\)\)\)/);
});

test('pré-écoute : le MagnaSave droit se lit comme sur la roue, correspondances non standard comprises', () => {
  const B = DEFAULT_BUTTONS;
  // MagnaSave non relevés (passés à l'étape « Boutons ») : la carte envoie Ctrl gauche et Ctrl droit.
  const skipped: ButtonsSource = { buttons: { ...B, leftMagna: undefined, rightMagna: undefined } as CabinetButtons };
  assert.deepEqual(collectionKeys(skipped), { previous: ['ControlLeft'], next: ['ControlRight'] }, 'la roue les lit');
  assert.deepEqual(listenKeys(skipped), ['ControlRight'], 'la pré-écoute aussi');
  assert.deepEqual(zoneSwitchKeys(skipped), ['ControlLeft', 'ControlRight', 'F6'], 'et la bascule des zones');
  // Relevés sur des boutons de joystick (Pinscape) : ceux-là.
  const joy = (n: number) => joystickCode('SDLJoy_03000000c0160000f705000000000000_1', n);
  const game = Object.fromEntries(Object.keys(B).map((id, i) => [id, joy(i + 1)])) as CabinetButtons;
  assert.deepEqual(listenKeys({ buttons: game }), [game.rightMagna]);
  assert.ok(zoneSwitchKeys({ buttons: game }).includes(game.leftMagna!));
  // MagnaSave droit pris par l'interface (Valider) : il reste Start, pas d'écoute ; le gauche seul ne suffit pas.
  const custom: ButtonsSource = { buttons: game, navigation: { previous: game.leftFlipper!, next: game.rightFlipper!, confirm: game.rightMagna!, back: game.exit! } };
  assert.deepEqual(listenKeys(custom), []);
  // Ctrl droit pris par un autre bouton du jeu : ni la roue ni la pré-écoute ne le prennent.
  const taken: ButtonsSource = { buttons: { ...B, leftMagna: undefined, rightMagna: undefined, extraBall: 'ControlRight' } as CabinetButtons };
  assert.deepEqual(listenKeys(taken), []);
  // Partout : la touche d'écoute est le MagnaSave droit de la roue, et le gauche reste la bascule des zones.
  for (const source of [undefined, skipped, { buttons: game }, custom, taken] as ButtonsSource[]) {
    const wheel = collectionKeys(source);
    const listen = listenKeys(source);
    assert.ok(listen.every((k) => wheel.next.includes(k)));
    assert.ok(!listen.length || wheel.previous.every((k) => zoneSwitchKeys(source).includes(k)));
  }
  // L'application lit la pré-écoute par cette seule règle.
  assert.match(read('src', 'frontend.ts'), /listenKeys: \(\) => magnaListenKeys\(\{ buttons, navigation \}\)/);
});

// Pastille de hauteur fixe (touche, bouton) : une seule ligne. « MagnaSave droit » passait à la ligne
// dans le bandeau de l'import en borne et sortait de son contour (10/11/2026).
test('toute pastille de hauteur fixe du rendu tient sur une ligne', () => {
  const dir = path.join(APP, 'renderer');
  let seen = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = m[2]!;
      const pill = /(^|[;\s])height:\s*[\d.]+(cqmin|px|em|rem)/.test(body) && body.includes('border-radius') && /border:\s*[\d.]/.test(body) && body.includes('inline-flex');
      if (!pill) continue;
      seen++;
      assert.match(body, /white-space:\s*nowrap/, `${file} : ${m[1]!.trim().split('\n').at(-1)} doit garder son texte sur une ligne`);
    }
  }
  assert.ok(seen >= 5, 'les pastilles du bandeau et des repères sont bien relevées');
});
