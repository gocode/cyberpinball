// Listes de contenu à deux zones (listzones.ts) : dans une longue liste de jeux, de médias ou de
// fichiers, Exit sort de la liste vers les actions du même écran, jamais de l'écran ; MagnaSave
// (F6) bascule d'une zone à l'autre ; chaque liste de contenu a son cadre et son repère. Ces tests
// fixent la classe de problème, pas seulement les écrans d'aujourd'hui :
// - sur tout écran à zones, quel que soit le choix dans la liste, Exit mène aux actions ; la
//   bascule va et revient, à la position quittée ; un flipper tenu reste dans sa zone ;
// - la liste de contenu se reconnaît par nature (cartes, lignes à choisir, lignes de la Santé),
//   jamais par longueur ; une liste d'options le dit (Section.options) ;
// - le rendu met dans un cadre, avec son repère, toute liste de contenu (library.js), et le
//   garde-fou de mise en page relève une liste sans repère dans le rendu réel ;
// - toute liste qui défile dans app/renderer est relevée ici, rangée liste de contenu, liste
//   d'actions, ou autre avec sa raison : une nouvelle fait échouer le test tant qu'on ne l'a pas
//   rangée.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  enterList,
  holdMove,
  HOLD_FAST_MS,
  HOLD_FAST_STRIDE,
  initialOf,
  leaveList,
  LETTER_EVERY_MS,
  letterJump,
  listActions,
  rememberZones,
  screenZones,
  sortedByName,
  switchZone,
  zoneHold,
  zoneOf,
  zoneStep,
  zoneByName,
  zoneSwitchKeys,
  DEFAULT_BUTTONS,
  type ZoneMemory,
  type ZoneSource,
} from '..';
import { menuRenderer } from './menu-renderer';

const APP = path.join(__dirname, '..', '..', '..', '..', 'app');
const RENDERER = path.join(APP, 'renderer');
const read = (...p: string[]) => fs.readFileSync(path.join(APP, ...p), 'utf8');

/** Écran d'essai : `list` lignes à choisir, `actions` actions, la liste avant ou après, « Retour » en dernier. */
function screen(list: number, actions: number, listFirst = true): { source: ZoneSource; count: number; ids: string[]; back: number } {
  const count = list + actions;
  const listIdx = listFirst ? [...Array(list).keys()] : [...Array(list).keys()].map((i) => i + actions);
  return {
    source: { sections: [{ rows: listIdx.map((action) => ({ action, pick: true })) }] },
    count,
    ids: [...Array(count).keys()].map((i) => `id${i}`),
    back: listFirst ? count - 1 : actions - 1,
  };
}

test('la liste de contenu se reconnaît par nature : cartes, lignes à choisir, lignes de la Santé ; jamais une liste d’options', () => {
  const source: ZoneSource = {
    sections: [
      { rows: [{ action: 0, pick: true }, { action: 1, pick: true }, { action: 4 } /* ligne rattachée, son action est dans la liste des actions */] },
      { options: true, rows: [{ action: 5, pick: true }] },
    ],
    media: { cards: [{ action: 2 }, {}] },
    health: { groups: [{ lines: [{ action: 3 }] }] },
  };
  assert.deepEqual(listActions(source, 8), [0, 1, 2, 3]);
  assert.deepEqual(screenZones(source, 8), { list: [0, 1, 2, 3], actions: [4, 5, 6, 7], groups: [0, 0, 2, 3] });
  // Ni liste, ni rien d'autre que la liste : pas de zones, Exit revient en arrière comme toujours.
  assert.equal(screenZones({ sections: [{ rows: [{ action: 0 }] }] }, 3), undefined);
  assert.equal(screenZones({ sections: [{ rows: [{ action: 0, pick: true }, { action: 1, pick: true }] }] }, 2), undefined);
  // Une liste courte reste une liste : le comportement ne change pas avec sa longueur.
  assert.deepEqual(screenZones({ sections: [{ rows: [{ action: 0, pick: true }] }] }, 2), { list: [0], actions: [1], groups: [0] });
});

test('sur tout écran à zones, Exit depuis la liste mène aux actions de l’écran, jamais hors de l’écran', () => {
  for (let list = 1; list <= 12; list++) {
    for (let actions = 1; actions <= 5; actions++) {
      for (const listFirst of [true, false]) {
        const s = screen(list, actions, listFirst);
        const z = screenZones(s.source, s.count)!;
        for (const cursor of z.list) {
          // Sans mémoire : « Retour » (l'action qui fait comme Exit), sinon la première action.
          assert.equal(leaveList(z, s.ids, {}, s.back), s.back);
          assert.equal(leaveList(z, s.ids, {}, undefined), z.actions[0]);
          // Entré dans la liste depuis une action : on y revient.
          for (const from of z.actions) assert.equal(leaveList(z, s.ids, { entry: s.ids[from] }, s.back), from);
          // L'entrée a disparu (liste redessinée) : « Retour ».
          assert.equal(leaveList(z, s.ids, { entry: 'disparue' }, s.back), s.back);
          assert.equal(zoneOf(z, leaveList(z, s.ids, { entry: s.ids[cursor] }, s.back)), 'actions', 'une entrée qui serait dans la liste ne compte pas');
        }
      }
    }
  }
});

test('MagnaSave (F6) bascule dans les deux sens, et ramène à la position quittée', () => {
  for (const listFirst of [true, false]) {
    const s = screen(20, 3, listFirst);
    const z = screenZones(s.source, s.count)!;
    for (const cursor of z.list) {
      let memory: ZoneMemory = {};
      const out = switchZone(z, s.ids, cursor, memory, s.back);
      assert.equal(zoneOf(z, out), 'actions');
      memory = rememberZones(z, memory, { index: cursor, id: s.ids[cursor] }, out);
      const back = switchZone(z, s.ids, out, memory, s.back);
      assert.equal(back, cursor, 'retour dans la liste à l’élément quitté');
      memory = rememberZones(z, memory, { index: out, id: s.ids[out] }, back);
      assert.equal(switchZone(z, s.ids, back, memory, s.back), out, 'et ressortie sur l’action d’où l’on était entré');
    }
    // Jamais entré : le début de la liste.
    assert.equal(enterList(z, s.ids, {}), z.list[0]);
    // Élément quitté disparu de la liste : son début.
    assert.equal(enterList(z, s.ids, { inList: 'disparu' }), z.list[0]);
  }
});

test('un appui de flipper suit l’ordre de l’écran ; tenu, il reste dans sa zone et s’arrête à son bout', () => {
  const s = screen(5, 3);
  const z = screenZones(s.source, s.count)!;
  // Appui : comme avant, d'une zone à l'autre à leur bord, avec tour complet.
  assert.equal(zoneStep(z, s.count, 4, 1), 5);
  assert.equal(zoneStep(z, s.count, 7, 1), 0);
  assert.equal(zoneStep(z, s.count, 0, -1), 7);
  assert.equal(zoneStep(undefined, 4, 3, 1), 0, 'sans zones : le rang voisin');
  // Liste après les actions : le parcours commence par les actions.
  const after = screen(5, 3, false);
  const za = screenZones(after.source, after.count)!;
  assert.equal(zoneStep(za, after.count, 2, 1), 3);
  assert.equal(zoneStep(za, after.count, 7, 1), 0);
  // Tenu : arrêté au bout, dans sa zone, jamais sur les actions.
  assert.equal(zoneHold(z, 4, 1), 4);
  assert.equal(zoneHold(z, 0, -1), 0);
  assert.equal(zoneHold(z, 5, -1), 5);
  assert.equal(zoneHold(z, 1, 1, HOLD_FAST_STRIDE), 4);
  for (let held = 0; held < 4000; held += 100) {
    for (const cursor of z.list) for (const dir of [-1, 1] as const) assert.equal(zoneOf(z, holdMove(z, [], cursor, dir, held, held).cursor), 'list');
  }
});

test('flipper tenu sur une liste triée par nom : de lettre en lettre, le temps de les lire', () => {
  const names = ['Atlas', 'Aurora', 'Basalt', 'Cinder', 'Cobalt', 'Crystal', 'Delta', 'Zephyr', 'Retour'];
  const s = { sections: [{ rows: names.slice(0, 8).map((_, action) => ({ action, pick: true })) }] };
  const z = screenZones(s, names.length)!;
  assert.equal(letterJump(z, names, 0, 1), 2, 'A → B');
  assert.equal(letterJump(z, names, 3, 1), 6, 'C → D');
  assert.equal(letterJump(z, names, 7, 1), 7, 'Z : arrêté au bout');
  assert.equal(letterJump(z, names, 5, -1), 3, 'au milieu des C : au premier C');
  assert.equal(letterJump(z, names, 3, -1), 2, 'premier C : la lettre d’avant');
  assert.equal(letterJump(z, names, 0, -1), 0);
  // Deux sections triées chacune (bibliothèque d'un ami : sur votre borne, absentes) : par lettre, section par section.
  const two = ['Atlas', 'Basalt', 'Zephyr', 'Comet', 'Maple', 'Retour'];
  const zt = screenZones({ sections: [{ rows: [0, 1, 2].map((action) => ({ action, pick: true })) }, { rows: [3, 4].map((action) => ({ action, pick: true })) }] }, two.length)!;
  assert.ok(zoneByName(zt, two));
  assert.equal(letterJump(zt, two, 2, 1), 3, 'Z, fin de la première section → C, début de la seconde');
  assert.equal(letterJump(zt, two, 3, -1), 2, 'et retour');
  // Avant le délai : un à un. Après : par lettre, une au plus par LETTER_EVERY_MS.
  assert.deepEqual(holdMove(z, names, 0, 1, HOLD_FAST_MS - 1, 0), { cursor: 1 });
  assert.deepEqual(holdMove(z, names, 0, 1, HOLD_FAST_MS, LETTER_EVERY_MS), { cursor: 2, letter: 'B' });
  assert.deepEqual(holdMove(z, names, 2, 1, HOLD_FAST_MS + 50, LETTER_EVERY_MS - 1), { cursor: 2, letter: 'B' });
  // Pas triée : de trois en trois.
  const mixed = ['Basalt', 'Zephyr', 'Atlas', 'Cobalt', 'Delta', 'Ember', 'Retour'];
  const zm = screenZones({ sections: [{ rows: mixed.slice(0, 6).map((_, action) => ({ action, pick: true })) }] }, mixed.length)!;
  assert.deepEqual(holdMove(zm, mixed, 1, 1, HOLD_FAST_MS, LETTER_EVERY_MS), { cursor: 4 });
});

test('initiales et ordre par nom : accents, chiffres et signes ; un élément mis en tête n’empêche pas le saut', () => {
  assert.equal(initialOf('Éclipse'), 'E');
  assert.equal(initialOf('« Ça » 2'), 'C');
  assert.equal(initialOf('2001'), '#');
  assert.ok(sortedByName(['24', 'Abc', 'Éclair', 'Ember', 'zinc']));
  assert.ok(sortedByName(['Zinc', 'Abc', 'Bcd', 'Cde']), 'le probable mis en tête, puis l’ordre alphabétique');
  assert.ok(!sortedByName(['Abc', 'Zinc', 'Bcd', 'Cde']));
  assert.ok(!sortedByName(['Abc']));
});

test('MagnaSave et F6 basculent ; jamais une touche déjà prise par un bouton de l’interface', () => {
  assert.deepEqual(zoneSwitchKeys(undefined), [DEFAULT_BUTTONS.leftMagna, DEFAULT_BUTTONS.rightMagna, 'F6']);
  // Un flipper relevé sur la touche d'un MagnaSave : le flipper la garde.
  const B = DEFAULT_BUTTONS;
  const keys = zoneSwitchKeys({ buttons: B, navigation: { previous: B.leftMagna, next: B.rightFlipper, confirm: B.start, back: B.exit } });
  assert.deepEqual(keys, [B.rightMagna, 'F6'], 'MagnaSave gauche est le bouton Précédent de cette borne : il le reste');
});

// ---------- Rendu : cadre et repère de chaque liste de contenu ----------

function state(library: Record<string, unknown>) {
  return { role: 'playfield', phase: 'library', help: false, count: 1, position: 1, neighbors: [], footer: [], gameKeys: [], menuKeys: [], nav: {}, library: { screen: 'custom', heading: 'Écran', back: 'Retour', hint: '', sections: [], cursor: 0, ...library } };
}
const listZone = (active: 'list' | 'actions', position?: number) => ({ active, position, total: 3, tag: active === 'list' ? { key: 'Exit', text: 'Sortir de la liste' } : { key: 'MagnaSave', text: 'Revenir à la liste' } });
const actions = [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'Retour' }];
const SCREENS: Record<string, Record<string, unknown>> = {
  'lignes à choisir': { sections: [{ title: 'Tables', rows: [0, 1, 2].map((action) => ({ text: `T${action}`, action, pick: true })) }] },
  'cartes des médias': { media: { cards: [0, 1, 2].map((action) => ({ action, title: `M${action}`, thumb: { kind: 'fallback', rotation: 0, text: '' } })) } },
  'galerie': { media: { gallery: true, files: true, cards: [0, 1, 2].map((action) => ({ action, title: `F${action}`, thumb: { kind: 'fallback', rotation: 0, text: '' } })) } },
  'Santé de la borne': { health: { counts: [], when: '', groups: [{ title: 'Écrans', lines: [0, 1, 2].map((action) => ({ action, title: `L${action}`, go: 'Ouvrir', state: 'ok', tone: 'ok', sign: '✓', word: 'OK' })) }] } },
};

test('rendu : toute liste de contenu est dans un cadre, avec son repère (Exit dans la liste, MagnaSave hors d’elle)', () => {
  for (const [name, screenView] of Object.entries(SCREENS)) {
    const { document, send } = menuRenderer();
    send(state({ ...screenView, actions, cursor: 1, zone: listZone('list', 2) }));
    const frame = document.querySelector('.lib-zone');
    assert.ok(frame, `${name} : cadre absent`);
    assert.ok(frame!.classList.contains('active'), `${name} : la zone du choix est soulignée`);
    assert.ok(frame!.querySelector(':scope > .lib-content') || frame!.querySelector(':scope > .health'), `${name} : la liste qui défile est dans le cadre`);
    assert.equal(frame!.querySelector('.lib-zone-tag .lib-keycap')?.textContent, 'Exit', `${name} : repère « Exit »`);
    assert.equal(frame!.querySelector('.lib-zone-tag-text')?.textContent, 'Sortir de la liste');
    assert.match(frame!.querySelector('.lib-zone-count')?.textContent ?? '', /2\s*\/\s*3/, `${name} : position du choix`);
    assert.ok(document.querySelector('.lib-body')!.classList.contains('zone-list'));
    send(state({ ...screenView, actions, cursor: 3, zone: listZone('actions') }));
    const idle = document.querySelector('.lib-zone')!;
    assert.ok(idle.classList.contains('idle'), `${name} : la liste s’éteint hors d’elle`);
    assert.equal(idle.querySelector('.lib-zone-tag .lib-keycap')?.textContent, 'MagnaSave');
    assert.deepEqual(JSON.parse((idle.querySelector('.lib-zone-tag') as unknown as { dataset: { act: string } }).dataset.act), { type: 'zone' }, 'un clic sur le repère fait comme MagnaSave');
  }
  // Sans zones (pas de liste de contenu) : aucun cadre.
  const { document, send } = menuRenderer();
  send(state({ sections: [{ rows: [{ text: 'Info' }] }], actions }));
  assert.equal(document.querySelector('.lib-zone'), null);
});

test('rendu : chaque conteneur de liste de contenu de library.js passe par le cadre (zoneFrame)', () => {
  const src = fs.readFileSync(path.join(RENDERER, 'library.js'), 'utf8');
  // Les conteneurs .lib-content créés par le rendu, et ce qu'il en fait.
  const made = [...src.matchAll(/libEl\('div', '(lib-content[^']*)'\)/g)].map((m) => m[1]);
  assert.deepEqual(made, ['lib-content', 'lib-content journey', 'lib-content health'], 'nouveau conteneur de liste : le passer par zoneFrame, ou le ranger ici avec sa raison');
  assert.equal([...src.matchAll(/zoneFrame\(content, v\.zone\)/g)].length, 2, 'liste et galerie : dans le cadre');
  assert.match(src, /zoneFrame\(renderHealth\([^)]*\), v\.zone\)/, 'Santé de la borne : dans le cadre');
  // Le parcours d'une table n'a pas de liste de contenu : ses étapes répètent les actions de l'écran.
  assert.ok(!/journey[\s\S]{0,80}pick/.test(src));
});

/**
 * Toute liste qui défile dans les pages (overflow auto ou scroll), rangée : liste de contenu (dans le
 * cadre d'une zone), liste d'actions, ou autre, avec sa raison.
 */
const SCROLLING: Record<string, string> = {
  'library.css | .lib-content': 'liste de contenu : dans le cadre de sa zone (zoneFrame) dès que l’écran a d’autres actions',
  'library.css | .lib-actions': 'actions de l’écran : Exit y revient en arrière',
  'library.css | .lib-body.lib-health > .health, .lib-body.lib-health > .lib-zone > .health': 'liste de contenu (Santé de la borne) : dans le cadre de sa zone',
  'library.css | .lib-picker .kind-places': 'liste de contenu (emplacements du sélecteur de fichiers) : dans le cadre de la zone, avec les fichiers',
  'library.css | .lib-picker .kind-entries': 'liste de contenu (fichiers du sélecteur) : dans le cadre de la zone',
  'settings.css | .list ul': 'réglages de VPX (settings.ts) : une liste de réglages, pas de contenu ; Exit y remonte d’un niveau, Page préc./suiv. y sautent de dix',
  'settings.css | .detail': 'réglages de VPX : le détail du réglage choisi, rien à choisir',
  'settings.css | .choices': 'réglages de VPX : les valeurs d’un réglage, panneau qu’Exit referme',
};

test('toute liste qui défile dans app/renderer est relevée et rangée', () => {
  const found: string[] = [];
  for (const file of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(RENDERER, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/(?:^|;)\s*overflow(?:-y)?:\s*(?:auto|scroll)\b/m.test(body!)) found.push(`${file} | ${selector!.trim().replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepEqual(found.filter((f) => !SCROLLING[f]), [], 'liste qui défile pas encore rangée (SCROLLING) : liste de contenu, d’actions, ou autre avec sa raison');
  assert.deepEqual(Object.keys(SCROLLING).filter((k) => !found.includes(k)), [], 'liste rangée qui n’existe plus : la retirer de SCROLLING');
});

test('le processus principal passe par les zones : Exit, bascule au relâchement, garde-fou de mise en page', () => {
  const library = read('src', 'library.ts');
  // Exit : leaveList quand le choix est dans la liste, l'écran ne se ferme que hors d'elle.
  assert.match(library, /is\(KEYS\.exit\)\) \{\s*if \(zones && zoneOf\(zones, cursor\) === 'list'\) cursor = leaveList\(/);
  // Les zones se décident pour chaque écran décrit (build), jamais écran par écran.
  assert.ok((library.match(/screenZones\(built, /g) ?? []).length >= 3);
  // La bascule se fait au relâchement de MagnaSave (jamais sur le Ctrl d'un raccourci) ; le menu transmet les relâchements.
  assert.match(library, /function handleKeyUp\(/);
  const frontend = read('src', 'frontend.ts');
  assert.match(frontend, /zoneKeys: \(\) => zoneSwitchKeys\(/);
  assert.match(frontend, /library\.handleKeyUp\(input\)/);
  // Le garde-fou relève, dans le rendu réel, une liste de contenu sans cadre ni repère.
  assert.match(read('src', 'layout-check.ts'), /liste de contenu sans cadre ni repère/);
});

test('le bandeau de la liste, ses touches et les pastilles ne passent jamais sous 20 px (feuilles du menu)', () => {
  // 20 px à la référence 1080 : 1,852cqmin (ou vmin). Le repère d'une liste, ses touches cerclées et les
  // pastilles étaient à 1,85 (19,98 px), sous le plancher du design system (revue de Codex, 29/10/2026).
  const floor = 20 / 10.8;
  const offenders: string[] = [];
  for (const file of ['library.css', 'frontend.css']) {
    const css = fs.readFileSync(path.join(RENDERER, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const [, value] of body!.matchAll(/(?:^|;)\s*font-size:\s*([0-9.]+)(?:cqmin|vmin)\s*(?:;|$)/gm)) {
        if (Number(value) < floor - 1e-9) offenders.push(`${file} ${selector!.trim().replace(/\s+/g, ' ')} : ${value}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('galerie : sur les actions de l’écran, le détail reste celui de la tuile où l’on reviendra (la galerie ne change pas de taille)', () => {
  const { document, send } = menuRenderer();
  const gallery = { ...SCREENS['galerie']!, actions };
  send(state({ ...gallery, cursor: 1, zone: { ...listZone('list', 2), listCursor: 1 } }));
  assert.equal(document.querySelector('.media-detail .media-title')?.textContent, 'F1');
  send(state({ ...gallery, cursor: 3, zone: { ...listZone('actions'), listCursor: 1 } }));
  assert.equal(document.querySelector('.media-detail .media-title')?.textContent, 'F1', 'après Exit : le détail de la tuile quittée, pas de trou');
  assert.equal(document.querySelector('.media-card.selected'), null, 'sans tuile en vert : un seul focus, sur les actions');
});
