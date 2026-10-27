import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { BUTTONS, INTERFACE_KEYS } from '../buttons';
import { toPhysicalScreen } from '../fingerprint';
import { resolveLocations } from '../locations';
import type { Cabinet, CabinetButtons } from '../model';
import { loadCabinet, saveCabinet } from '../store';
import { devPcDisplays, emptyCabinet } from './fixtures';

// Relevé des boutons par le vrai chemin d'une touche du clavier : l'assistant, rendu hors
// écran sur un bureau Windows caché, reçoit chaque touche par webContents.sendInputEvent
// (autopilote « Clavier:KeyA »), comme du clavier du PC : before-input-event, Chromium,
// la page (preload.ts). Octobre 2026 : l'assistant annulait l'appui, Chromium jetait alors
// le relâchement, et le relevé, qui compte une touche quand on la relâche, ne voyait plus
// aucune touche du clavier ; l'autopilote, qui appelait le traitement des touches sans
// passer par Chromium, ne le voyait pas. Les boutons du joystick passent par un joystick
// virtuel de la bibliothèque SDL de VPX (autopilote « Joy<n> »), comme un Pinscape.

const REPO = path.join(__dirname, '..', '..', '..', '..');
const SCREENS = path.join(REPO, 'docs', 'ecrans', 'pc-dev.json');

/** Bibliothèque SDL de VPX : CYBERPINBALL_SDL, sinon celle du VPX installé à la racine de Cyber Pinball. */
function sdlLibrary(): string | undefined {
  if (process.env.CYBERPINBALL_SDL) return process.env.CYBERPINBALL_SDL;
  const root = resolveLocations(process.env).root;
  if (!root) return undefined;
  const dir = path.join(root, 'emulators', 'vpx', 'current');
  return ['SDL364.dll', 'SDL3.dll'].map((name) => path.join(dir, name)).find((file) => fs.existsSync(file));
}

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}

const electron = process.platform === 'win32' ? electronPath() : undefined;
const skip = electron ? false : 'Electron sous Windows requis';

/** Borne des écrans simulés (pc-dev.json), avec ces boutons du jeu ; son VPinballX.ini dans le bac à sable. */
function cabinetIn(home: string, buttons?: CabinetButtons): void {
  const cabinet: Cabinet = emptyCabinet();
  cabinet.screens = devPcDisplays().map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint };
  cabinet.vpx = { iniPath: path.join(home, 'sandbox', 'VPinballX.ini') };
  if (buttons) cabinet.buttons = buttons;
  fs.mkdirSync(path.join(home, 'sandbox'), { recursive: true });
  saveCabinet(home, cabinet);
}

/** L'assistant sans opérateur dans un bac à sable : sa sortie (traces de l'autopilote comprises). */
function runWizard(home: string, codes: string[], args: string[], extra: NodeJS.ProcessEnv = {}): string {
  const dir = path.dirname(home);
  const audio = path.join(dir, 'sans-son.json');
  fs.writeFileSync(audio, '[]');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CYBERPINBALL_HOME: home,
    CYBERPINBALL_ROOT: path.join(dir, 'root'),
    CYBERPINBALL_DISPLAYS: SCREENS,
    CYBERPINBALL_AUDIO_OUTPUTS: audio,
    CYBERPINBALL_LANGUE: 'fr',
    CYBERPINBALL_AUTOPILOT: codes.join(','),
    ...extra,
  };
  delete env.CYBERPINBALL_A_L_ECRAN;
  delete env.CYBERPINBALL_CAPTURE;
  const run = spawnSync(electron!, ['app', '--assistant', ...args, `--user-data-dir=${path.join(dir, 'chromium')}`], { cwd: REPO, env, encoding: 'utf8', timeout: 170_000, windowsHide: true });
  const output = `${run.stdout}\n${run.stderr}`;
  assert.equal(run.status, 0, output);
  assert.doesNotMatch(output, /Autopilote : .* n’est pas arrivée|sans joystick lisible/, output);
  return output;
}

const keyboard = (...codes: string[]) => codes.map((c) => `Clavier:${c}`);
const repeat = (code: string, n: number) => Array.from({ length: n }, () => code);

/** Ligne de trace d'un relevé (handleButtonKey, sans opérateur). */
const recorded = (kind: string, id: string, code: string, outcome = 'gardé') => `Assistant : relevé ${kind}, ${id} sur ${code} : ${outcome}`;

/** Un relevé au clavier de chaque bouton du jeu, tous différents et acceptés par VPX. */
const GAME_BY_KEYBOARD: Record<string, string> = {
  leftFlipper: 'KeyA',
  rightFlipper: 'KeyS',
  start: 'Digit2',
  exit: 'KeyQ',
  credit: 'Digit3',
  plunger: 'KeyW',
  leftMagna: 'KeyR',
  rightMagna: 'KeyT',
  extraBall: 'KeyD',
  pause: 'KeyF',
  tilt: 'KeyG',
  slamTilt: 'KeyH',
  nudgeLeft: 'KeyZ',
  nudgeRight: 'KeyX',
  nudgeCenter: 'Space',
  volumeDown: 'Minus',
  volumeUp: 'Equal',
};

test('boutons du jeu au clavier : chaque action relevée et enregistrée, un bouton refait seul, touche prise refusée, Retour arrière et Échap', { skip, timeout: 200_000 }, () => {
  assert.deepEqual(Object.keys(GAME_BY_KEYBOARD), BUTTONS.map((b) => b.id), 'un relevé pour chaque bouton du jeu');
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
        // (après les quatre actions), Entrée (Start) le refait, 5 le relève.
        ...keyboard(...repeat('ArrowRight', 8), 'Enter', 'Digit5'),
        // Le lanceur choisi puis laissé : Retour arrière annule, sa touche reste.
        ...keyboard(...repeat('ArrowRight', 9), 'Enter', 'Backspace'),
        // « Quitter sans enregistrer ? » : Échap répond non, l'étape reprend.
        'click:#quit',
        ...keyboard('Escape'),
        // « Tout relever » (quatrième action) : chaque bouton au clavier.
        ...keyboard(...repeat('ArrowRight', 3), 'Enter'),
        ...keyboard('KeyA', 'KeyS', 'KeyA'), // A, déjà au flipper gauche, refusée pour Start
        ...keyboard('Digit2', 'KeyE', 'Backspace'), // Exit relevé sur E par erreur, refait
        ...keyboard(...Object.values(GAME_BY_KEYBOARD).slice(3)),
        // Essai des boutons principaux, puis Start enregistre.
        ...keyboard('KeyA', 'KeyS', 'KeyQ', 'Digit2'),
      ],
      ['--boutons'],
    );
    for (const line of [
      recorded('game', 'credit', 'Digit5'),
      'Assistant : « Quitter sans enregistrer ? » (buttonsSummary)',
      recorded('game', 'start', 'KeyA', 'refusé (A est déjà la touche du bouton Flipper gauche'),
      recorded('game', 'exit', 'KeyE'),
      ...Object.entries(GAME_BY_KEYBOARD).map(([id, code]) => recorded('game', id, code)),
    ])
      assert.ok(output.includes(line), `${line}\n---\n${output}`);
    // Le lanceur n'a pas été relevé : Retour arrière l'a laissé.
    assert.ok(!output.includes(recorded('game', 'plunger', 'Backspace')), output);
    // Enregistré : Échap n'a pas quitté, chaque bouton a sa touche du clavier.
    assert.deepEqual(loadCabinet(home)!.buttons, GAME_BY_KEYBOARD);
    const ini = fs.readFileSync(path.join(home, 'sandbox', 'VPinballX.ini'), 'utf8');
    assert.match(ini, /^Mapping\.Credit1 = Key;32\b/m, 'crédit sur 3 dans [Input]');
    assert.match(ini, /^Mapping\.LaunchBall = Key;26\b/m, 'lanceur sur W dans [Input]');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('assistant complet au clavier : boutons du jeu puis de l’interface relevés, l’assistant passe à la suite', { skip, timeout: 200_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-clavier-complet-'));
  try {
    const home = path.join(dir, 'home');
    const navigation: Record<string, string> = { previous: 'KeyJ', next: 'KeyL', confirm: 'KeyK', back: 'KeyU', help: 'KeyI' };
    const output = runWizard(
      home,
      [
        // Borne neuve : l'assistant commence par les boutons du jeu.
        ...keyboard(...Object.values(GAME_BY_KEYBOARD)),
        ...keyboard('KeyA', 'KeyS', 'KeyQ', 'Digit2'),
        // Boutons de l'interface, proposés sur ceux du jeu : « Tout relever », puis au clavier ;
        // Retour (U) passe le bouton des réglages.
        'click:#actions button:nth-child(4)',
        ...keyboard(...Object.values(navigation), 'KeyU'),
        ...keyboard('KeyJ', 'KeyL', 'KeyU', 'KeyK'),
        'CtrlQ',
      ],
      [],
    );
    assert.deepEqual(INTERFACE_KEYS.items.map((b) => b.id), [...Object.keys(navigation), 'settings']);
    for (const line of [
      ...Object.entries(GAME_BY_KEYBOARD).map(([id, code]) => recorded('game', id, code)),
      ...Object.entries(navigation).map(([id, code]) => recorded('interface', id, code)),
      recorded('interface', 'settings', 'KeyU', 'passé'),
    ])
      assert.ok(output.includes(line), `${line}\n---\n${output}`);
    // Les deux relevés validés au clavier : la question de Ctrl+Q arrive après les boutons.
    const quit = /Assistant : « Quitter sans enregistrer \? » \((\w+)\)/.exec(output);
    assert.ok(quit, output);
    assert.ok(!['buttons', 'buttonsSummary', 'navigation', 'navigationSummary'].includes(quit[1]!), `encore au relevé : ${quit[1]}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const dll = electron ? sdlLibrary() : undefined;

test('boutons du jeu au joystick (Pinscape) et au clavier mélangés : relevés et enregistrés', { skip: skip || (dll ? false : 'aucune bibliothèque SDL de VPX sur ce poste'), timeout: 200_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-joystick-'));
  try {
    const home = path.join(dir, 'home');
    cabinetIn(home);
    const output = runWizard(
      home,
      [
        'click:#actions button:nth-child(4)', // « Tout relever »
        'Joy0', 'Joy1', 'Joy2', 'Joy3', // flippers, Start, Exit au joystick
        'Clavier:Digit5', // crédit au clavier
        'Joy5', // lanceur
        ...repeat('Joy3', BUTTONS.length - 6), // Exit passe les boutons facultatifs
        'Joy0', 'Joy1', 'Joy3', 'Joy2', // essai, Start enregistre
      ],
      ['--boutons'],
      { CYBERPINBALL_SDL: dll },
    );
    const buttons = loadCabinet(home)!.buttons!;
    assert.deepEqual(Object.keys(buttons).sort(), ['credit', 'exit', 'leftFlipper', 'plunger', 'rightFlipper', 'start'], output);
    assert.equal(buttons.credit, 'Digit5');
    for (const [id, n] of [['leftFlipper', 0], ['rightFlipper', 1], ['start', 2], ['exit', 3], ['plunger', 5]] as const)
      assert.match(buttons[id]!, new RegExp(`^SDLJoy_[0-9a-f]{32}_\\d+;${n}$`), `${id} : ${buttons[id]}`);
    assert.ok(output.includes(recorded('game', 'credit', 'Digit5')), output);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
