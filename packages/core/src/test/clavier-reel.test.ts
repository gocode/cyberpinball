import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { BUTTONS, INTERFACE_KEYS } from '../buttons';
import type { CabinetButtons } from '../model';
import { loadCabinet } from '../store';
import { cabinetIn, electron, GAME_BY_KEYBOARD, keyboard, recorded, repeat, REPO, runWizard, sdlLibrary, skip } from './clavier-reel-outils';
import { removeTempDir } from './temp-dir';

// Relevé des boutons par le vrai chemin d'une touche du clavier : l'assistant, rendu hors
// écran sur un bureau Windows caché, reçoit chaque touche par webContents.sendInputEvent
// (autopilote « Clavier:KeyA »), comme du clavier du PC : before-input-event, Chromium,
// la page (preload.ts). Octobre 2026 : l'assistant annulait l'appui, Chromium jetait alors
// le relâchement, et le relevé, qui compte une touche quand on la relâche, ne voyait plus
// aucune touche du clavier ; l'autopilote, qui appelait le traitement des touches sans
// passer par Chromium, ne le voyait pas. Les boutons du joystick passent par un joystick
// virtuel de la bibliothèque SDL de VPX (autopilote « Joy<n> »), comme un Pinscape.
// Outils communs : clavier-reel-outils.ts ; les cas du premier écran d’une borne neuve sont dans
// clavier-premier-ecran-*.test.ts, répartis pour tourner en parallèle.

test('autopilote : rien n’attend entre un appui rejoué et son relâchement, sinon une machine chargée en fait un maintien', () => {
  // Bancs du 26/11/2026 : la pause de 50 ms entre l'appui et le relâchement a duré 6 s ; la touche
  // était vraiment tenue pour l'assistant, qui ouvrait « Quitter sans enregistrer ? ».
  const body = (source: string, name: string) => {
    const at = source.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} introuvable`);
    const rest = source.slice(at);
    return rest.slice(0, rest.search(/\r?\n\}\r?\n/));
  };
  const app = path.join(REPO, 'app', 'src');
  const wizard = fs.readFileSync(path.join(app, 'wizard.ts'), 'utf8');
  const key = body(wizard, 'pressRealKey');
  assert.match(key, /sendInputEvent\(\{ type: 'keyDown'[^\n]*\n\s*win\.webContents\.sendInputEvent\(\{ type: 'keyUp'/, 'relâchement aussitôt après l’appui');
  assert.doesNotMatch(key, /await|delay\(|setTimeout/, key);
  // Le maintien relit les joysticks avant de conclure (un relâchement pas encore lu).
  assert.match(body(wizard, 'watchHold'), /readJoysticksNow\(\);\s*if \(held\?\.timer !== timer\) return;\s*stopHold\(\);/);
  const joystick = fs.readFileSync(path.join(app, 'joystick-input.ts'), 'utf8');
  for (const name of ['pressVirtualButton', 'pressVirtualHat', 'pressVirtualPinscapeButton']) {
    const press = body(joystick, name);
    assert.match(press, /pressAndRelease\(/, name);
    assert.doesNotMatch(press, /setTimeout|pause\(/, name);
  }
  // Relâché dès que le sondage a lu l'appui.
  assert.match(body(joystick, 'pressAndRelease'), /if \(down && !pressed\) \{\s*pressed = true;\s*release\(\);/);
});

test('boutons du jeu au clavier : chaque action relevée et enregistrée, un bouton refait seul, touche prise reprise, Retour arrière et Échap', { skip, timeout: 290_000 }, () => {
  assert.deepEqual(Object.keys(GAME_BY_KEYBOARD), BUTTONS.filter((b) => !b.advanced).map((b) => b.id), 'un relevé pour chaque bouton du jeu (les avancés ne se demandent pas pas à pas)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-clavier-'));
  try {
    const home = path.join(dir, 'home');
    // Borne d'un poste sans boutons de borne : Start sur Entrée, crédit sur 1, lanceur sur Flèche bas.
    const before: CabinetButtons = { leftFlipper: 'ShiftLeft', rightFlipper: 'ShiftRight', start: 'Enter', exit: 'Escape', credit: 'Digit1', plunger: 'ArrowDown', extraBall: 'KeyX' };
    cabinetIn(home, before);
    const output = runWizard(
      home,
      [
        // « Boutons du jeu » s'ouvre sur les touches actuelles. Flèches jusqu'à « Crédit »
        // (après les cinq actions), Entrée (Start) le refait, 5 le relève.
        ...keyboard(...repeat('ArrowRight', 9), 'Enter', 'Digit5'),
        // Le lanceur choisi puis laissé : Retour arrière annule, sa touche reste.
        ...keyboard(...repeat('ArrowRight', 10), 'Enter', 'Backspace'),
        // « Quitter sans enregistrer ? » : Échap répond non, l'étape reprend.
        'click:#quit',
        ...keyboard('Escape'),
        // « Tout modifier » (quatrième action) : chaque bouton au clavier.
        ...keyboard(...repeat('ArrowRight', 3), 'Enter'),
        // A, déjà au flipper gauche, reprise par Start : le flipper gauche est vidé, redemandé à la fin.
        // Retour arrière revient à Start, relevé sur 2.
        ...keyboard('KeyA', 'KeyS', 'KeyA', 'Backspace', 'Digit2'),
        ...keyboard('KeyE', 'Backspace'), // Exit relevé sur E par erreur, refait
        ...keyboard(...Object.values(GAME_BY_KEYBOARD).slice(3)),
        ...keyboard('KeyA'), // le flipper gauche, redemandé après le dernier bouton
        // Essai des boutons principaux, puis Start enregistre.
        ...keyboard('KeyA', 'KeyS', 'KeyQ', 'Digit2'),
      ],
      ['--boutons'],
    );
    for (const line of [
      recorded('game', 'credit', 'Digit5'),
      'Assistant : « Quitter sans enregistrer ? » (buttonsSummary)',
      recorded('game', 'start', 'KeyA', 'gardé, leftFlipper vidé'),
      recorded('game', 'start', 'Digit2'),
      recorded('game', 'exit', 'KeyE'),
      ...Object.entries(GAME_BY_KEYBOARD).map(([id, code]) => recorded('game', id, code)),
    ])
      assert.ok(output.includes(line), `${line}\n---\n${output}`);
    // Le lanceur n'a pas été relevé : Retour arrière l'a laissé.
    assert.ok(!output.includes(recorded('game', 'plunger', 'Backspace')), output);
    // Enregistré : Échap n'a pas quitté, chaque bouton a sa touche du clavier.
    assert.deepEqual(loadCabinet(home)!.buttons, GAME_BY_KEYBOARD, output);
    const ini = fs.readFileSync(path.join(home, 'sandbox', 'VPinballX.ini'), 'utf8');
    assert.match(ini, /^Mapping\.Credit1 = Key;32\b/m, 'crédit sur 3 dans [Input]');
    assert.match(ini, /^Mapping\.LaunchBall = Key;26\b/m, 'lanceur sur W dans [Input]');
  } finally {
    removeTempDir(dir);
  }
});

test('assistant complet au clavier : boutons de l’interface puis du jeu relevés, « Précédent » revient à l’étape d’avant, l’assistant passe à la suite', { skip, timeout: 290_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-clavier-complet-'));
  try {
    const home = path.join(dir, 'home');
    const navigation: Record<string, string> = { previous: 'KeyJ', next: 'KeyL', confirm: 'KeyK', back: 'KeyU', help: 'KeyI' };
    const output = runWizard(
      home,
      [
        // Borne neuve : « Vos boutons sont-ils déjà les bons ? » ; Échap (Exit) : modifier mes
        // boutons, sans être relevé. Les boutons de l'interface d'abord (16/11/2026) : ils pilotent
        // toute la suite. Retour (U) passe les réglages, le bureau Windows, le mode nuit et la sortie sans enregistrer.
        ...keyboard('Escape'),
        ...keyboard(...Object.values(navigation), 'KeyU', 'KeyU', 'KeyU', 'KeyU'),
        ...keyboard('KeyJ', 'KeyL', 'KeyU', 'KeyK'),
        // Boutons du jeu proposés sur ceux de l'interface ; Retour arrière revient à l'interface,
        // valider (K) la garde, puis « Tout modifier » et le jeu au clavier.
        ...keyboard('Backspace', 'KeyK'),
        'click:#actions button:nth-child(4)',
        ...keyboard(...Object.values(GAME_BY_KEYBOARD)),
        ...keyboard('KeyA', 'KeyS', 'KeyQ', 'Digit2'),
        'CtrlQ',
      ],
      [],
    );
    assert.deepEqual(INTERFACE_KEYS.items.map((b) => b.id), [...Object.keys(navigation), 'settings', 'desktop', 'nightMode', 'quit']);
    for (const line of [
      ...Object.entries(GAME_BY_KEYBOARD).map(([id, code]) => recorded('game', id, code)),
      ...Object.entries(navigation).map(([id, code]) => recorded('interface', id, code)),
      recorded('interface', 'settings', 'KeyU', 'passé'),
      recorded('interface', 'desktop', 'KeyU', 'passé'),
      recorded('interface', 'nightMode', 'KeyU', 'passé'),
      recorded('interface', 'quit', 'KeyU', 'passé'),
    ])
      assert.ok(output.includes(line), `${line}\n---\n${output}`);
    // Les deux relevés validés au clavier : la question de Ctrl+Q arrive après les boutons.
    const quit = /Assistant : « Quitter sans enregistrer \? » \((\w+)\)/.exec(output);
    assert.ok(quit, output);
    assert.ok(!['buttons', 'buttonsSummary', 'navigation', 'navigationSummary'].includes(quit[1]!), `encore au relevé : ${quit[1]}`);
  } finally {
    removeTempDir(dir);
  }
});

test('premier écran d’une borne neuve : sans réponse, le délai garde les touches et l’assistant continue', { skip, timeout: 290_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-premier-delai-'));
  try {
    const home = path.join(dir, 'home');
    // Le vrai délai, raccourci à 2 s ; l'autopilote attend sa fin (« FinDuDelai ») au lieu de 21 s comptées à part,
    // qui sous charge pouvaient finir avant lui (26/11/2026).
    const output = runWizard(home, ['FinDuDelai', 'CtrlQ'], [], { CYBERPINBALL_DELAI_BOUTONS_MS: '2000' });
    assert.doesNotMatch(output, /au bout d’une minute/, output);
    assert.doesNotMatch(output, /Assistant : relevé game/, output);
    assert.match(output, /Assistant : « Quitter sans enregistrer \? » \(assign\)/, output);
  } finally {
    removeTempDir(dir);
  }
});

const dll = electron ? sdlLibrary() : undefined;

test('boutons du jeu au joystick (Pinscape, croix d’une manette) et au clavier mélangés : relevés et enregistrés', { skip: skip || (dll ? false : 'aucune bibliothèque SDL de VPX sur ce poste'), timeout: 290_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-joystick-'));
  try {
    const home = path.join(dir, 'home');
    cabinetIn(home);
    const output = runWizard(
      home,
      [
        'click:#actions button:nth-child(4)', // « Tout modifier »
        'Joy0', 'Joy1', 'Joy2', 'Joy3', // flippers, Start, Exit au joystick
        'Clavier:Digit5', // crédit au clavier
        'JoyCroix:up', // lanceur à la croix (manette en XInput)
        ...repeat('Joy3', BUTTONS.filter((b) => !b.advanced).length - 6), // Exit passe les boutons facultatifs
        'Joy0', 'Joy1', 'Joy3', 'Joy2', // essai, Start enregistre
      ],
      ['--boutons'],
      { CYBERPINBALL_SDL: dll },
    );
    const buttons = loadCabinet(home)!.buttons!;
    assert.deepEqual(Object.keys(buttons).sort(), ['credit', 'exit', 'leftFlipper', 'plunger', 'rightFlipper', 'start'], output);
    assert.equal(buttons.credit, 'Digit5');
    for (const [id, n] of [['leftFlipper', 0], ['rightFlipper', 1], ['start', 2], ['exit', 3], ['plunger', 258]] as const)
      assert.match(buttons[id]!, new RegExp(`^SDLJoy_[0-9a-f]{32}_\\d+;${n}$`), `${id} : ${buttons[id]}`);
    assert.ok(output.includes(recorded('game', 'credit', 'Digit5')), output);
  } finally {
    removeTempDir(dir);
  }
});